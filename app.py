# Force redeploy - Render caching fix
#!/usr/bin/env python3
import os
import uuid
import random
import traceback
import csv
import requests
import numpy as np
import openai
import logging
import urllib.parse
import difflib
import pytz
from datetime import datetime, timedelta
import time
import json

import re
from datetime import datetime, timezone
from flask import Flask, request, jsonify, g, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv
from openai import RateLimitError, OpenAIError

from utils import parse_user_info, log_interaction, load_product_embeddings
from chat_reasoning import (
    detect_faq,
    parse_gpt_response,
    load_behavior_rules,
    apply_behavior_rules
)

# ──────────────────────────────────────────────────────────────────────────────
# Configuration & Logging
# ──────────────────────────────────────────────────────────────────────────────
load_dotenv()
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s"
)
logger = logging.getLogger("mamatega")

# Your Shopify and OpenAI config
SHOPIFY_DOMAIN       = os.getenv("SHOPIFY_STORE_URL", "shopmamatega.com").replace("https://", "").replace("http://", "").rstrip("/") or "shopmamatega.com"
SHOPIFY_ADMIN_TOKEN  = os.getenv("SHOPIFY_ADMIN_API")
EMBEDS_PATH          = os.getenv("EMBEDDINGS_PATH", "./product_embeddings.json")
BEHAVIOR_RULES_PATH  = "behavior_rules.json"
BRANDS_CSV_PATH      = os.path.join(os.path.dirname(__file__), "Brands.csv")
FINE_TUNED_MODEL     = os.getenv("FINE_TUNED_MODEL", "ft:gpt-3.5-turbo-0125:personal::BunGDkYK")  # Default to your brands fine-tuned model

openai.api_key       = os.getenv("OPENAI_API_KEY")
SHOPIFY_STOREFRONT_API = "https://shopmamatega.com/api/2023-04/graphql.json"
STOREFRONT_TOKEN = os.getenv("SHOPIFY_STOREFRONT_TOKEN")

# List of allowed fine-tuned models (update with your actual model names after fine-tuning completes)
ALLOWED_MODELS = [
    "ft:gpt-3.5-turbo-0125:personal::BumeQqW6",
    "ft:gpt-3.5-turbo-0125:personal::BunGDkYK"  # Brands fine-tuned model
]

# ──────────────────────────────────────────────────────────────────────────────
# In-memory Stores
# ──────────────────────────────────────────────────────────────────────────────
chat_histories = {}   # session_id → chat history
last_results   = {}   # session_id → last product list
user_carts = {}       # cart_id → cart data
cart_counter = 1      # For generating unique cart IDs

# ──────────────────────────────────────────────────────────────────────────────
# Preload known brands
# ──────────────────────────────────────────────────────────────────────────────
known_brands = set()
if os.path.exists(BRANDS_CSV_PATH):
    with open(BRANDS_CSV_PATH, newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        for row in reader:
            if not row or row[0].startswith('#') or not row[0].strip():
                continue
            name = row[0].strip().lower()
            known_brands.add(name)
else:
    logger.warning("Brands.csv not found; skipping brand preload")

# ──────────────────────────────────────────────────────────────────────────────
# Load embeddings & behavior rules
# ──────────────────────────────────────────────────────────────────────────────
products       = load_product_embeddings(EMBEDS_PATH)
prod_matrix    = np.vstack([p["embedding"] for p in products])
prod_matrix   /= np.linalg.norm(prod_matrix, axis=1, keepdims=True)
behavior_rules = load_behavior_rules(BEHAVIOR_RULES_PATH)

# ──────────────────────────────────────────────────────────────────────────────
# Flask app setup
# ──────────────────────────────────────────────────────────────────────────────
app = Flask(__name__)
CORS(app, resources={r"/ask": {"origins": "*"}})

@app.before_request
def start_timer():
    g.start = datetime.now(timezone.utc)

@app.after_request
def log_request(response):
    now = datetime.now(timezone.utc)
    duration = (now - g.start).total_seconds()
    logger.info("%s %s %s %d %.3f",
                request.remote_addr,
                request.method,
                request.path,
                response.status_code,
                duration)
    return response

@app.errorhandler(Exception)
def handle_exception(e):
    logger.exception("Unhandled exception: %s", e)
    return jsonify({"error": "Internal server error"}), 500

# ──────────────────────────────────────────────────────────────────────────────
# CSV Logging
# ──────────────────────────────────────────────────────────────────────────────
def log_chat_to_csv(chat_id, session_id, message_type, message_text, timestamp, user_info=None):
    """Log chat messages to CSV file for analysis"""
    csv_file = "chat_logs.csv"
    file_exists = os.path.exists(csv_file)
    
    try:
        with open(csv_file, 'a', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            
            # Write header if file doesn't exist
            if not file_exists:
                writer.writerow([
                    'chat_id', 'session_id', 'message_type', 'message_text', 
                    'timestamp', 'user_agent', 'ip_address', 'user_info'
                ])
            
            # Write message data
            writer.writerow([
                chat_id,
                session_id,
                message_type,  # 'user' or 'bot'
                message_text,
                timestamp,
                request.headers.get('User-Agent', ''),
                request.remote_addr,
                json.dumps(user_info) if user_info else ''
            ])
            
    except Exception as e:
        logger.error(f"Failed to log chat to CSV: {e}")

# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────
def get_history(session_id):
    if session_id not in chat_histories:
        chat_histories[session_id] = [{
            "role": "system",
            "content": (
                f"You are the MamaTega Assistant. Only recommend products we carry at "
                f"{SHOPIFY_DOMAIN}. Never mention other retailers. If the user asks about orders, "
                "direct them to contact us. Use a warm, story-like, conversational tone and remember prior turns. "
                "Never say 'I'm a new assistant and still in training.' Only say 'If I am unable to answer your question, please click the WhatsApp link to chat with the store' if you truly cannot answer, and only after 5 minutes of user inactivity (not immediately). Never generate this fallback message unless the above conditions are met."
                "If the user's name is not known, jokingly ask 'What may I call you?' at the start of the conversation. If the user provides a name, use it in all future replies and do not prompt again. Refer to yourself as 'MamaTega' in all bot replies (e.g., 'MamaTega: ...'). In dark mode, use yellow for the bot label; in light mode, use white. For the user label, use white in dark mode and blue in light mode. Never repeat the same greeting or opening message if you have already greeted the user in this conversation. If the user's last message is a casual reply (like 'okay', 'thanks', 'alright', etc.), generate a friendly, context-aware follow-up or ask a relevant question, but do NOT greet again. Always use the last 3-5 messages for context and avoid repeating yourself or your previous answers."
                "If the user provides their name, address them by name in your replies (e.g., 'Hi Tayo!'). "
                "When a new chat starts, suggest 3-5 relevant quick replies the user can tap to get started. "
                "Keep your responses concise and brief (no more than 3-4 sentences) unless the user asks for more detail (e.g., says 'tell me more', 'explain', or 'details'). "
                "When recommending products, DO NOT use numbered or bulleted lists, and DO NOT embed any product links—just mention the product titles. If you must list them, put each product on its own line, but never as a numbered or bulleted list. "
                "Never generate or embed any clickable links (including markdown links, HTML links, or WhatsApp/Instagram links) for products or contact info. Only mention product titles, and for contact, ask if the user wants info, then provide plain text instructions (not links) if they say yes."
                "Always use paragraphs (with line breaks) for long or store info messages, so they are easy to read."
                "If the user wants to contact via WhatsApp, first ask: 'Would you like me to include the items in your cart or a specific product in your WhatsApp message?' If the user says yes or specifies, generate a pre-filled WhatsApp message including the cart items and/or specified product, and provide the message as plain text (not a link)."
                "If the user asks how to order or mentions WhatsApp, only provide plain text instructions if the user says yes after you ask 'Would you like our contact info?'. Never say 'reach us at' or provide phone numbers/Instagram unless the user explicitly asks for contact info. "
                "Do not repeat our contact info in every answer. Only offer it if the user asks, or if they say they want to order, or if you ask and they say yes to being offered contact info. "
                "If the user greets you (e.g., says hello or hi), acknowledge that they are browsing the website, ask if they have a specific product in mind, and if there are products in their cart, mention them and suggest other products to pair with them. Let the AI do the product pairing and suggestion logic, not just list items. "
                "If the user asks about 'the one you mentioned above' or similar, always reference the specific products you just mentioned in your previous message."
            )
        }]
    return chat_histories[session_id]

def is_product_intent(text: str) -> bool:
    # Don't trigger for vague requests or simple responses
    vague_phrases = ["i need something", "help me", "i need help", "what do you have", "show me"]
    simple_responses = ["yes", "no", "okay", "ok", "thanks", "thank you", "sure", "maybe"]
    
    # Check for simple responses (single words or very short phrases)
    text_clean = text.strip().lower()
    if len(text_clean.split()) <= 2 and text_clean in simple_responses:
        return False
    
    # Check for names (capitalized single words that aren't product names)
    if len(text_clean.split()) == 1 and text_clean[0].isupper() and text_clean not in ["soap", "cream", "lotion", "buy", "order", "price", "skincare", "niacinamide"]:
        return False
    
    if any(phrase in text.lower() for phrase in vague_phrases):
        return False
    
    return any(k in text.lower() for k in (
        "soap", "cream", "lotion", "buy", "order", "price", "skincare", "niacinamide"
    ))

def is_best_product_query(text: str) -> bool:
    text = text.lower()
    return (
        ('best' in text or 'top' in text) and (
            'soap' in text or 'product' in text or 'serum' in text or 'cream' in text or 'lotion' in text
        )
    )

def is_affirmative_or_number(text):
    text = text.strip().lower()
    # Accept common typos and variants of 'yes'
    yes_variants = {"yes", "show me", "ok", "sure", "please", "yep", "yeah", "yess", "yesd", "yea", "yas", "yup"}
    if text in yes_variants:
        return True
    # Fuzzy match for 'yes' typos (e.g., 'yesd', 'yess', 'yesss')
    if text.startswith("yes") and len(text) <= 6:
        return True
    if text.isdigit() and 1 <= int(text) <= 10:
        return True
    return False

_EMB_CACHE, _EMB_ORDER = {}, []
_last_embed_time = 0
_embed_rate_limit = 1.0  # Minimum seconds between embedding requests

def embed_query(q: str, max_size=500):
    global _last_embed_time
    key = q.lower().strip()
    
    # Check cache first
    if key in _EMB_CACHE:
        _EMB_ORDER.remove(key); _EMB_ORDER.append(key)
        return _EMB_CACHE[key]
    
    # Rate limiting
    current_time = time.time()
    time_since_last = current_time - _last_embed_time
    if time_since_last < _embed_rate_limit:
        sleep_time = _embed_rate_limit - time_since_last
        logger.info("Rate limiting: sleeping for %.2f seconds", sleep_time)
        time.sleep(sleep_time)
    
    try:
        resp = openai.embeddings.create(model="text-embedding-3-small", input=key)
        _last_embed_time = time.time()
        vec = np.array(resp.data[0].embedding, dtype=np.float32)
        vec /= np.linalg.norm(vec)
        _EMB_CACHE[key] = vec; _EMB_ORDER.append(key)
        if len(_EMB_ORDER) > max_size:
            old = _EMB_ORDER.pop(0); _EMB_CACHE.pop(old, None)
        return vec
    except RateLimitError as e:
        logger.error("Rate limit reached for embeddings: %s", e)
        # Return a fallback vector or None to avoid crashing
        return None
    except OpenAIError as e:
        logger.error("OpenAI embedding error: %s", e)
        return None

def keyword_search(query: str, k=3):
    """Fallback keyword-based search when embeddings fail"""
    query_lc = query.lower()
    results = []
    
    for product in products:
        title_lc = product["title"].lower()
        if query_lc in title_lc:
            results.append(product)
    
    # Sort by relevance (exact matches first)
    results.sort(key=lambda p: query_lc in p["title"].lower(), reverse=True)
    return results[:k]

def semantic_search(query: str, k=3):
    vec = embed_query(query)
    if vec is None:
        logger.warning("Embedding failed for query '%s', falling back to keyword search", query)
        # Fallback to keyword-based search when embeddings fail
        return keyword_search(query, k)
    
    query_lc = query.lower()
    # Filter by product type if present in query
    type_keywords = [
        ("bar soap", ["bar soap", "bar-soap", "soap bar"]),
        ("liquid soap", ["liquid soap", "liquid-soap"]),
        ("moisturizing soap", ["moisturizing soap", "moisturizing-soap"]),
        ("fragrance-free soap", ["fragrance-free soap", "fragrance free soap"]),
        ("body wash", ["body wash", "bodywash"]),
        ("serum", ["serum"]),
        ("lotion", ["lotion"]),
        ("cream", ["cream"]),
    ]
    filtered_products = products
    for label, keywords in type_keywords:
        if any(kw in query_lc for kw in keywords):
            filtered_products = [p for p in products if any(kw in p["title"].lower() or kw in p.get("tags", "").lower() for kw in keywords)]
            break
    if not filtered_products:
        filtered_products = products
    filtered_matrix = np.vstack([p["embedding"] for p in filtered_products])
    filtered_matrix /= np.linalg.norm(filtered_matrix, axis=1, keepdims=True)
    sims = filtered_matrix @ vec
    idxs = sims.argsort()[-k:][::-1]
    return [filtered_products[i] for i in idxs]

def check_shopify_brand(brand: str) -> bool:
    url = (
        f"https://{SHOPIFY_DOMAIN}/admin/api/2023-04/products.json"
        f"?vendor={requests.utils.quote(brand)}&limit=1"
    )
    headers = {"X-Shopify-Access-Token": SHOPIFY_ADMIN_TOKEN}
    try:
        r = requests.get(url, headers=headers, timeout=5); r.raise_for_status()
        return bool(r.json().get("products"))
    except Exception as e:
        logger.error("Brand check error: %s", e)
        return False

def get_dynamic_suggestions(user_q):
    q = user_q.lower()
    suggestions = []
    if "soap" in q:
        suggestions = ["bar soap", "liquid soap", "moisturizing soap", "fragrance-free soap", "What ingredients does this soap have?"]
    elif "brighten" in q or "brightening" in q or "skin brightening" in q:
        suggestions = ["skin brightening creams", "skin brightening serums", "best products for skin brightening", "What ingredients help with skin brightening?"]
    elif "order" in q or "buy" in q:
        suggestions = ["What payment methods do you accept?", "How long does delivery take?", "Can I track my order?", "Do you deliver nationwide?"]
    elif "delivery" in q:
        suggestions = ["What are your delivery options?", "How long does delivery take?", "Do you deliver nationwide?", "Can I track my delivery?"]
    elif "brand" in q:
        suggestions = ["Do you sell this brand?", "Show me all brands", "Popular brands", "Best-selling brands"]
    elif "skincare" in q:
        suggestions = ["best skincare for oily skin", "skincare for dry skin", "skincare routine", "What ingredients does this skincare have?"]
    elif "makeup" in q or "best makeup brands" in q:
        suggestions = ["foundation", "concealer", "mascara", "lipstick", "blush", "eyeshadow"]
    elif "foundation" in q:
        suggestions = ["liquid foundation", "powder foundation", "best foundation for oily skin", "best foundation for dry skin"]
    elif "concealer" in q:
        suggestions = ["best concealer for dark circles", "liquid concealer", "stick concealer", "How do I apply concealer?"]
    else:
        suggestions = [
            "What are the best products for skin brightening?",
            "What are your store hours?",
            "How can I order?",
            "Do you sell this brand?",
            "What ingredients does this product have?",
            "What are your delivery options?"
        ]
    print(f"[SUGGESTIONS] User query: '{user_q}' => Suggestions: {suggestions}")
    return suggestions

def shopify_search_products(query, limit=5):
    url = f"https://{SHOPIFY_DOMAIN}/admin/api/2023-04/products.json?title={requests.utils.quote(query)}&limit={limit}"
    headers = {"X-Shopify-Access-Token": SHOPIFY_ADMIN_TOKEN}
    try:
        r = requests.get(url, headers=headers, timeout=5)
        r.raise_for_status()
        return r.json().get("products", [])
    except Exception as e:
        logger.error("Shopify search error: %s", e)
        return []

# Add typo correction for common mistakes before intent/FAQ checks
COMMON_TYPOS = {
    'uour': 'your',
    'whats': 'what is',
    'wher': 'where',
    'adress': 'address',
    'phne': 'phone',
    'contatc': 'contact',
    'numbr': 'number',
    'moisturiser': 'moisturizer',
    # Add more as needed
}
def correct_typos(text):
    words = text.split()
    corrected = [COMMON_TYPOS.get(w, w) for w in words]
    return ' '.join(corrected)

NIGERIA_TZ = pytz.timezone('Africa/Lagos')
STORE_HOURS = {
    0: (8, 20),  # Monday: 8AM–8PM
    1: (8, 20),
    2: (8, 20),
    3: (8, 20),
    4: (8, 20),
    5: (8, 20),
    6: (13, 19), # Sunday: 1PM–7PM
}
# Set WhatsApp number for all WhatsApp links and replies
WHATSAPP_NUMBER = '2348189880899'
STORE_PHONE = "08189880899, 08037133704"  # Store phone numbers for direct calls, not WhatsApp
STORE_ADDRESS = "Tejuosho Ultra Modern Shopping Centre, Mosque Plaza, Yaba, Lagos, Nigeria"
GOOGLE_MAPS_LINK = "https://goo.gl/maps/your_store_map_link"  # Replace with your actual Google Maps link

def get_store_status():
    now = datetime.now(NIGERIA_TZ)
    weekday = now.weekday()
    open_hour, close_hour = STORE_HOURS[weekday]
    open_time = now.replace(hour=open_hour, minute=0, second=0, microsecond=0)
    close_time = now.replace(hour=close_hour, minute=0, second=0, microsecond=0)
    if open_time <= now < close_time:
        mins_left = int((close_time - now).total_seconds() // 60)
        return f"Yes, we're open! We close in {mins_left//60} hours and {mins_left%60} minutes (today at {close_hour}:00)."
    else:
        # Find next opening time
        for i in range(1, 8):
            next_day = (weekday + i) % 7
            next_open_hour, _ = STORE_HOURS[next_day]
            next_open = now + timedelta(days=i)
            next_open = next_open.replace(hour=next_open_hour, minute=0, second=0, microsecond=0)
            if next_open > now:
                break
        hours_until = int((next_open - now).total_seconds() // 3600)
        return f"No, we're closed right now. We'll open again in about {hours_until} hours (at {next_open_hour}:00 on {next_open.strftime('%A')})."

def extract_product_name(user_q):
    m = re.search(r'ingredients.*?([A-Za-z0-9\- ]+)', user_q, re.IGNORECASE)
    if m:
        return m.group(1).strip()
    return None

def find_product_by_name(name):
    name = name.lower()
    for p in products:
        if name in p['title'].lower():
            return p
    return None

def get_product_ingredients(product):
    return product.get('ingredients', '')

# ──────────────────────────────────────────────────────────────────────────────
# /ask endpoint
# ──────────────────────────────────────────────────────────────────────────────
SOAP_CLARIFIERS = [
    "What type of soap are you looking for?",
    "Are you interested in bar soap or liquid soap?",
    "Is this for face, body, or both?",
    "Do you have a preferred brand or ingredient?"
]
VAGUE_INPUTS = ["smh", "lol", "hmm", "idk", "???", "what", "help", "eh", "umm", "uh", "huh"]

LAST_USER_MESSAGE_TIME = {}
GREETINGS = [
    "Hi!",
    "Welcome back!",
    "Nice to see you again!"
]

def strip_brand(title):
    return re.sub(r'^MamaTega\s+', '', title, flags=re.IGNORECASE)

def generate_cart_id():
    """Generate a unique cart ID"""
    global cart_counter
    cart_id = f"CART{cart_counter:06d}"
    cart_counter += 1
    return cart_id

def create_cart_page(cart_items, user_info=None):
    """Create a cart page with items and return cart ID"""
    cart_id = generate_cart_id()
    
    # Calculate total
    total_price = sum(item.get('final_price', 0) for item in cart_items)
    
    cart_data = {
        'id': cart_id,
        'items': cart_items,
        'total_price': total_price,
        'created_at': datetime.now(timezone.utc).isoformat(),
        'updated_at': datetime.now(timezone.utc).isoformat(),
        'user_info': user_info or {},
        'item_count': len(cart_items),
        'never_expires': True,  # Cart pages never expire
        'persistent': True      # Links are persistent
    }
    
    user_carts[cart_id] = cart_data
    return cart_id

# 2. Add post-processing to remove numbers/bullets and repeated greetings:
def clean_ai_reply(reply, is_first_message=False):
    # Remove leading numbers/bullets from lines
    lines = reply.split('\n')
    cleaned_lines = []
    for line in lines:
        # Remove lines that are just numbers (e.g., '1.', '2.')
        if re.match(r'^\s*\d+\.?\s*$', line):
            continue
        # Remove leading numbers/bullets from product lines
        line = re.sub(r'^\s*([\d]+[\.)]|[-•])\s*', '', line)
        cleaned_lines.append(line)
    cleaned = '\n'.join(cleaned_lines)
    # Remove repeated greetings except on first message
    if not is_first_message:
        cleaned = re.sub(r'^(hi|hello|hey|greetings)[!,.\s-]*', '', cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r'^(there!|there,|there\.|there\s+)', '', cleaned, flags=re.IGNORECASE)
    return cleaned.strip()

@app.route("/ask", methods=["POST"])
def ask():
    try:
        data = request.get_json(force=True)
        user_q = data.get("prompt", "").strip()
        history = data.get("history", [])  # Expecting an array of {role, content, time}
        meta = {}
        logger.info(f"USER PROMPT: {user_q}")

        # NEW: Allow model override per request
        model_name = data.get("model", FINE_TUNED_MODEL)

        # 1. Build a rich system prompt with store info and product catalog summary
        # 1. Update the system prompt:
        store_info = f"""
You are the MamaTega Assistant for MamaTega Cosmetics. Be warm, friendly, and conversational.

IMPORTANT RULES:
- Never show phone numbers, WhatsApp, or Instagram unless the user explicitly asks for contact info.
- Never generate clickable links for products or contact info. Only mention product titles.
- Never use bulleted lists or numbered lists for product recommendations—use paragraphs or line breaks ONLY.
- NEVER greet the user except on the VERY FIRST message of a new conversation.
- Do not repeat contact info in every answer; only provide it if the user explicitly asks.
- NEVER say "If I can't answer your question, you can reach out to us via WhatsApp" or similar fallback messages.
- NEVER generate WhatsApp fallback messages - this is handled by the frontend after 5 minutes of inactivity.
- Focus on answering the user's question directly without mentioning contact methods unless specifically asked.

CONVERSATION HANDLING:
- For casual greetings like "hi", "hello", "hey" - respond naturally and ask how you can help with skincare or beauty products.
- For casual responses like "okay", "thanks", "alright" - acknowledge warmly and ask if they need help with anything specific.
- For names or simple responses like "Tayo", "John", "yes", "no" - respond naturally without searching for products.
- For vague requests like "I need something" or "help me" - ask clarifying questions about their skin concerns or what they're looking for.
- Only search for products when the user provides specific details about what they want.
- For general conversation, be friendly and helpful without forcing product recommendations.
- NEVER search products for simple acknowledgments, names, or basic responses.

NAME HANDLING:
- If the user provides their name, remember it and use it in future responses.
- Only ask for their name ONCE at the very beginning of a brand new conversation.

PRODUCT CATEGORIES WE CARRY:
We offer a wide range of beauty, skincare, and personal care products including:

Skincare: Acrylic Powder, BB Cream, CC Cream, Cleanser, Cleansing Cloths, Cleansing Gel, Cleansing Wash, Cleansing Wipes, Day Cream, Eye Care, Eye Cream, Face Cream, Face Mask, Face Oil, Face Palette, Face Powder, Face Primer, Face Soap, Face Sponge, Face Spray, Face Wash, Face Wipes, Facial Tissue, Foundation, Glow Booster, Glow Kit, Lip Balm, Lip Care, Lip Corrector, Lip Cream, Lip Definer, Lip Gloss, Lip Ink, Lip Liner, Lip Palette, Lip Pencil, Lip Primer, Lip Stain, Lip Stick, Make Up Box, Make Up Brushes, Make Up Pad, Make Up Primer, Make Up Purse, Make Up Remover, Make Up Sponge, Moisturizer, Night Cream, Nose Mask, Oil Mattifier, Scrub, Serum, Skin Primer, Skin Vitamins, Sun Screen, Toner, Toning Cream, Toning Gel, Toning Lotion, Tube Cream, Tube Gel

Body Care: After Shave, Anti-Perspirant, Bath Accessories, Bath Salt, Bath Towel, Bathrobe, Body Cream, Body Lotion, Body Milk, Body Mist, Body Oil, Body Powder, Body Shampoo, Body Soap, Body Spray, Body Wash, Deodorant, Hand Care, Hand Soap, Shower Cap, Shower Cream, Shower Gel

Hair Care: Beard Care, Bonnet, Bun, Curler, Curling Cream, Curling Lotion, Curling Wax, Detangler, Durag, Extension, Hair Booster, Hair Care, Hair Clip, Hair Cream, Hair Extension, Hair Lotion, Hair Mask, Hair Masque, Hair Net, Hair Oil, Hair Packers, Hair Polish, Hair Spray, Hair Wash, Hair Wax, Head Band, Locs & Twist, Mousse, Relaxer, Shampoo, Sleeping Cap, Straightener, Styling Gel, Texturizer, Treatment, Wig, Wig Cap, Wrap Cap

Makeup: Air Foundation, Blush, Bronzer, Brow Filler, Brow Gel, Brow Palette, Brow Perfecter, Brush, Brush Cleaner, Concealer, Contour, Crown, Eye Brow Definer, Eye Brow Filler, Eye Brow Gel, Eye Brow Shaper, Eye Brow Tint, Eye Lash Curler, Eye Lashes, Eye Liner, Eye Pencil, Eye Primer, Eye Shadow, Eye Shadow Base, Face Definer, Finishing Spray, Glitter Glue, Highlighter, Illuminator, Lash Adhesive, Lash Glue, Lip Balm, Lip Care, Lip Corrector, Lip Cream, Lip Definer, Lip Gloss, Lip Ink, Lip Liner, Lip Palette, Lip Pencil, Lip Primer, Lip Stain, Lip Stick, Luminizer, Mascara, Nail Brush, Nail Care, Nail File, Nail Glue, Nail Lacquer, Nail Lamp, Nail Polish, Nail Polish Remover, Nail Powder, Nail Thickener, Pomade, Powder, Ring Light, Roll On, Scissors, Setting Lotion, Setting Powder, Setting Spray, Shimmer, Stick On Nails, Strobing Stick, Top Coat, Tweezers

Fragrances: Air Freshener, Cologne, Perfume, Perfume Oil, Scented Oil, Unisex Perfume/Cologne

Personal Care: Band, Breast Pads, Breath Spray, Condoms, Diaper, Douche, Ear Piercing, Feeding Bottle, Feminine Wash, Intimate Wash, Lubricant, Massage, Medical Gloves, Mouth Wash, Panty Liner, Tampons, Teeth Whitening, Toe Separators, Tongue Scrapper, Tooth Brush, Tooth Floss, Tooth Paste, Tooth Polish, Underpads, Underwear, Wipes

Nail Care: Base Coat, Nail Brush, Nail Care, Nail File, Nail Glue, Nail Lacquer, Nail Lamp, Nail Polish, Nail Polish Remover, Nail Powder, Nail Thickener, Top Coat

Hair Styling: Boob Tape, Bra Accessories, Clipper, Cloth Clippers, Color And Dye, Comb, Developer, Dye Kit, Glue, Glue Remover, Needle Rollers, Office Pin, Peg, Ponytailers, Rollers, Sharpner, Shaver, Shaving Blade, Shaving Cream, Shaving Foam, Shaving Gel, Shaving Powder, Shaving Solution, Shaving Stick, Trimmer, Wax Stick, Wax Strips, Waxing Gel

Home & Lifestyle: Bag, Baking Soda, Bed Protector, Bed Sheet, Bleach, Candles, Care, Cooking Oil, Costume, Detergent, Diffuser, Diffusser, Dish Washing Liquid, Disinfecting Wipes, Disposable Razor, Dryer, Fan, Floor Cleaner, Foot Care, Fragrance Refill, Frosting Cap, Gift Set, Glasses, Gloves, Humdifier, Insect Net, Insecticide, Key Holder, Kids Clothing, Lamp, Laundry Bag, Lemon Juice, Lighter, Mini Fridge, Mirror, Oven Cleaner, Paper Towel, Pedicure, Pocket Paks, Pocket Tissue, Pom Throw, Pudding, Rechargeable Lamp, Sanitizing Wipes, Scarf, Serviettes, Shoe, Shoe Cleaner, Slippers, Socks, Spa, Spray Bottle, Spray Starch, Table Cloth, Table Fan, Toilet Cleaner, Toilet Paper, Toys, Travel Kit, T shirt, T-Shirt, Vacuum Flask, Vest, Vinegar, Water Bottle, Zip Loc

Store Details:
- Location: Tejuosho Ultra Modern Shopping Centre, Mosque Plaza, Yaba, Lagos
- Store Hours: Mon–Sat 8AM–8PM, Sun 1PM–7PM

Always answer clearly and kindly. If asked about shipping, how to order, ingredients, or hours — respond based on the store info. If the user asks for recommendations, list up to 3 relevant products if found. Only mention product titles (never links).
"""
        # Optionally, you can add a summary of the product catalog here if you want the AI to reference it directly.

        # 2. Build the messages array for OpenAI
        messages = [{"role": "system", "content": store_info}]
        name = data.get("name", "").strip()
        name_asked_before = data.get("nameAskedBefore", False)
        
        if name:
            messages.insert(1, {
                "role": "system",
                "content": f"The user's name is {name}. Always greet them by name in your first reply after they provide it (e.g., 'Hi {name}!'), and vary your greetings and follow-ups every time. Never repeat the same greeting or opening message."
            })
        elif name_asked_before:
            messages.insert(1, {
                "role": "system",
                "content": "The user has been asked for their name before. Do NOT ask for their name again. Respond naturally to their message."
            })
        
        for turn in history:
            if turn.get("role") and turn.get("content"):
                messages.append({"role": turn["role"], "content": turn["content"]})
        # Add the latest user message
        messages.append({"role": "user", "content": user_q})

        # 3. Call OpenAI to generate the response
        resp = openai.chat.completions.create(
            model=model_name,
            temperature=0.7,
            max_tokens=1000,  # Ensure we get full responses
            messages=messages
        )
        answer = resp.choices[0].message.content.strip()
        # Determine if this is the first message in the session
        is_first_message = len(history) <= 2  # system + user
        answer = clean_ai_reply(answer, is_first_message=is_first_message)
        logger.info(f"AI RESPONSE: {answer}")

        # WhatsApp link logic
        def get_last_user_message(history):
            for turn in reversed(history):
                if turn.get('role') == 'user' and turn.get('content'):
                    return turn['content']
            return ''
        # In all WhatsApp link generation (e.g., for cart, order, etc.), use WHATSAPP_NUMBER
        last_msg = get_last_user_message(history)
        wa_url = f"web.whatsapp.com/send?phone={WHATSAPP_NUMBER}&text={urllib.parse.quote(last_msg)}"
        if user_q.lower() in ("link", "the link?", "that link?", "whatsapp link", "whatsapp?"):
            last_msg = get_last_user_message(history)
            if last_msg.strip().lower() in ("link", "the link?", "that link?", "whatsapp link", "whatsapp?"):
                # Use previous user message if current is just 'link'
                last_msg = get_last_user_message(history[:-1])
            if not last_msg or last_msg.strip().lower() in ("link", "the link?", "that link?", "whatsapp link", "whatsapp?"):
                last_msg = "Hey, Mama Tega, I need assistance with a product."
            else:
                last_msg = f"Hey, Mama Tega, I need assistance with this: {last_msg}"
            wa_url = f"web.whatsapp.com/send?phone={WHATSAPP_NUMBER}&text={urllib.parse.quote(last_msg)}"
            return jsonify({
                **meta,
                "answer": wa_url,
                "results": [],
                "suggestions": get_dynamic_suggestions(user_q),
                "search_method": "ai_only",
                "shopify_results": [],
                "shopify_found": False,
                "semantic_results": [],
                "semantic_found": False,
                "intent_classifier_output": "ai_only"
            })

        # Check if user requested a specific number of products
        list_n_match = re.search(r'list\s*(\d+)', user_q.lower())
        list_n = int(list_n_match.group(1)) if list_n_match else None

        # If user expresses buying intent for multiple products, add WhatsApp link
        buy_intent_phrases = [
            'i want all', 'i want to buy', 'how can i buy', 'how do i buy', 'add all', 'buy these', 'purchase all', 'purchase these', 'order all', 'order these'
        ]
        if any(phrase in user_q.lower() for phrase in buy_intent_phrases):
            # Try to extract product names from the last bot reply
            product_lines = []
            for line in answer.split('\n'):
                # Look for lines that look like product names (e.g., 'Product Name: ...')
                m = re.match(r'^([A-Za-z0-9&+.,\-\'\s]+):', line)
                if m:
                    product_lines.append(m.group(1).strip())
                elif line and not line.lower().startswith('if you') and not line.lower().startswith('need') and len(line.split()) < 12:
                    # Fallback: short lines that are not instructions
                    product_lines.append(line.strip())
            if product_lines:
                product_list = ', '.join(product_lines)
                wa_msg = f"Hey, Mama Tega, I want to buy these products: {product_list}"
                wa_url = f"web.whatsapp.com/send?phone={WHATSAPP_NUMBER}&text={urllib.parse.quote(wa_msg)}"
                answer += f"\n\nTo order directly, use this WhatsApp link: {wa_url}"

        # If user asks for WhatsApp number/contact, always override the answer
        contact_phrases = [
            'whatsapp number', 'contact on whatsapp', 'your whatsapp', 'whatsapp contact', 'how do i contact', 'how can i contact', 'contact info', 'contact information', 'phone number', 'whatsapp?', 'whatsapp', 'contact', 'reach you', 'reach out'
        ]
        # In all WhatsApp link and WhatsApp-specific replies, use WHATSAPP_NUMBER only
        if any(phrase in user_q.lower() for phrase in contact_phrases):
            answer = (
                f'You can contact us on WhatsApp at +{WHATSAPP_NUMBER}.\n'
                f'You can also reach us directly using this WhatsApp link: web.whatsapp.com/send?phone={WHATSAPP_NUMBER}&text=Hi%20MamaTega!%20I%20have%20a%20question'
            )

        # In the /ask endpoint, after list_n is set:
        # Always use list_n for product count if specified, no cap
        semantic_k = list_n if list_n else 10

        # 2. In the /ask endpoint, before semantic_search, check for brand queries and force brand results if found
        brand_match = None
        brand_keywords = [b for b in known_brands]  # Use loaded brands from Brands.csv
        for brand in brand_keywords:
            if brand in user_q.lower():
                brand_match = brand
                break

        # Initialize variables that will be used later
        session_id = data.get("sessionId")
        user_ip = request.remote_addr
        user_info = {}
        
        # Generate chat ID for CSV logging
        chat_id = data.get("chatId", str(uuid.uuid4()))
        timestamp = datetime.now().isoformat()
        
        # Log user message to CSV
        log_chat_to_csv(chat_id, session_id, "user", user_q, timestamp, user_info)
        
        # Brand match logic
        if brand_match:
            logger.info(f"Brand match found: {brand_match} for query: {user_q}")
            # 1. Brands.csv (fuzzy): just confirms the brand exists
            # 2. Product embeddings
            emb_results = [p for p in products if brand_match in p['title'].lower() or brand_match in p.get('tags', '').lower()]
            # 3. Shopify API
            shopify_products = shopify_search_products(brand_match.title(), limit=list_n or 5)
            # Combine all results, deduplicate by handle
            all_results = []
            seen_handles = set()
            for p in emb_results + shopify_products:
                handle = p.get('handle')
                if handle and handle not in seen_handles:
                    all_results.append(p)
                    seen_handles.add(handle)
            if all_results:
                # Format product_lines for injection
                product_lines = "\n".join(f"{p['title']}: {p.get('description', p.get('body_html', ''))[:80]} (https://{SHOPIFY_DOMAIN}/products/{p['handle']})" for p in all_results[:list_n or 5])
                injection = {
                    "role": "system",
                    "content": (
                        f"For the user's request, you have these {brand_match.title()} products available:\n"
                        f"{product_lines}\n"
                        "Recommend these products in a warm, conversational way. Mention the product names naturally in your response. Do NOT use numbers or bullets in your reply."
                    )
                }
                history.insert(1, injection)

        # 8) Brand-check (moved inside try block and adjusted)
        generic_types = {"soap", "soaps", "lotion", "lotions", "cream", "creams", "serum", "serums", "product", "products", "moisturizer", "moisturizers", "fragrance", "fragrances"}
        m = re.search(r"(?:do you sell|brand)\s+([A-Za-z0-9&+.'\- ]+)", user_q, re.IGNORECASE)
        if m:
            brand = m.group(1).strip().lower()
            if brand in generic_types:
                m = None  # skip brand check for generic types
            else:
                found = brand in known_brands
                if found:
                    # Instead of showing products, just answer yes and let AI handle follow-up
                    brand_link = f"https://{SHOPIFY_DOMAIN}/search?q={urllib.parse.quote(brand)}"
                    chat_histories[session_id].append({"role": "assistant", "content": f"Yes, we carry [{brand.title()}]({brand_link})!"})
                    return jsonify({**meta, "answer": f"Yes, we carry [{brand.title()}]({brand_link})!", "results": [], "suggestions": get_dynamic_suggestions(user_q)})
                sorry = (
                    f"Sorry, we don't stock {brand.title()}.\n"
                    "Please call 08189880899 or 08037133704, email info@shopmamatega.com, or DM @mamategacosmeticsandspa"
                )
                return jsonify({**meta, "answer": sorry, "results": [], "suggestions": get_dynamic_suggestions(user_q)})

        # 9) Append user turn
        history = get_history(session_id)
        history.append({"role": "user", "content": user_q})

        # 10) Semantic-search injection
        results = []
        all_handles = []
        shopify_found = False
        shopify_results = []
        semantic_found = False
        semantic_results = []
        
        try: # Nested try-except for product search
            if is_product_intent(user_q):
                all_results = semantic_search(user_q, k=semantic_k if list_n else 50)
                # Filter out products without handles and create handle list
                valid_results = [p for p in all_results if p.get('handle')]
                all_handles = list(dict.fromkeys([p['handle'] for p in valid_results]))
                results = valid_results.copy()
                semantic_found = True
                semantic_results = results
                if results:
                    random.shuffle(results)
                    if list_n:
                        results = results[:list_n]
                    else:
                        results = results[:5]
                    if is_best_product_query(user_q):
                        results = [{"title": strip_brand(p["title"]), "link": f"https://{SHOPIFY_DOMAIN}/products/{p['handle']}"} for p in results]
                        product_lines = "\n".join(f"{r['title']}" for r in results)
                        injection = {"role": "system", "content": ("For the user's request, you have these products available:\n" f"{product_lines}\n" "Recommend these products in a warm, conversational way. Mention the product names naturally in your response. Do NOT use numbers or bullets in your reply.")}
                    else:
                        results = [{"title": strip_brand(p["title"]), "link": f"https://{SHOPIFY_DOMAIN}/products/{p['handle']}"} for p in results]
                        product_lines = "\n".join(f"{strip_brand(r['title'])}: {r.get('description', '')} (https://{SHOPIFY_DOMAIN}/products/{r['handle']})".strip() for r in results)
                        injection = {"role": "system", "content": ("For the user's request, you have these products available:\n" f"{product_lines}\n" "Recommend these products in a warm, conversational way. Mention the product names naturally in your response. Do NOT use numbers or bullets in your reply.")}
                    history.insert(1, injection)
                else:
                    answer = "Sorry, I couldn't find any products for that. Could you try a different term or be more specific?"
                    return jsonify({**meta, "answer": answer, "results": [], "suggestions": get_dynamic_suggestions(user_q)})
        except Exception as e:
            logger.error("Product search error: %s", e)
            answer = "Sorry, something went wrong. Please try again later."
            return jsonify({**meta, "answer": answer, "results": [], "suggestions": get_dynamic_suggestions(user_q)})

        # 11) "link?" follow-up
        if user_q.lower() in ("link", "the link?", "that link?"):
            prods = last_results.get(session_id, [])
            if prods:
                links = "\n".join([f"[{p['title']}]({p['link']})" for p in prods])
                return jsonify({**meta, "answer": links, "results": prods, "view_all_link": ""})
            else:
                return jsonify({**meta, "answer": "Which product link do you need?", "results": [], "view_all_link": ""})

        # 12) Chat completion (using fine-tuned if provided)
        try:
            resp = openai.chat.completions.create(
                model=model_name,
                temperature=0.7,
                messages=history
            )
            answer = resp.choices[0].message.content.strip()
            history.append({"role": "assistant", "content": answer})
        except Exception as e:
            logger.error("GPT error: %s", e)
            if "429" in str(e) or "rate limit" in str(e).lower():
                answer = "I am assisting customers at the moment, please come back in a few minutes."
            else:
                answer = "Sorry, something went wrong. Please try again later."
        
        # Log bot response to CSV
        log_chat_to_csv(chat_id, session_id, "bot", answer, timestamp, user_info)

        # 13) Persist last_results & log
        last_results[session_id] = results
        now = datetime.now(timezone.utc)
        log_interaction({
            "question":        user_q,
            "detected_intent": "product_search" if results else "chat",
            "was_answered":    True,
            "answer_snippet":  answer[:100],
            "date":            now.strftime("%Y-%m-%d"),
            "time":            now.strftime("%H:%M"),
            "user_ip":         user_ip,
            **user_info
        })

        suggestions = get_dynamic_suggestions(user_q)
        SHOPIFY_BASE_URL = "https://shopmamatega.com"
        return jsonify({
            **meta,
            "answer": answer,
            "results": [],
            "suggestions": get_dynamic_suggestions(user_q),
            "search_method": "shopify" if shopify_found else ("semantic" if semantic_found else "none"),
            "shopify_results": shopify_results,
            "shopify_found": shopify_found,
            "semantic_results": semantic_results,
            "semantic_found": semantic_found
        })
        
    except Exception as e:
        logger.error(f"/ask error: {e}")
        return jsonify({
            "error": str(e),
            "answer": "Sorry, something went wrong. Please try again later.",
            "search_method": "none",
            "shopify_results": [],
            "shopify_found": False,
            "semantic_results": [],
            "semantic_found": False,
            "intent_classifier_output": "error"
        }), 500

# ──────────────────────────────────────────────────────────────────────────────
# Health, Metrics, OpenAPI
# ──────────────────────────────────────────────────────────────────────────────
app.start_time = datetime.now(timezone.utc)

@app.route("/health")
def health():
    return jsonify({"status": "ok"}), 200

@app.route("/metrics")
def metrics():
    uptime = datetime.now(timezone.utc) - app.start_time
    return jsonify({
        "uptime_seconds": int(uptime.total_seconds()),
        "active_sessions": len(chat_histories)
    }), 200

@app.route("/openapi.json")
def openapi():
    spec = {
        "openapi": "3.0.0",
        "info": {"title":"MamaTega Assistant API","version":"1.0.0"},
        "paths": {
            "/ask": {"post": {"summary":"Chat endpoint","responses":{"200":{"description":"OK"}}}}
        }
    }
    return jsonify(spec), 200

@app.route("/models", methods=["GET"])
def list_models():
    return jsonify({"models": ALLOWED_MODELS})

# Serve frontend static files
@app.route('/')
def serve_frontend():
    return send_from_directory('frontend/search-widget', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('frontend/search-widget', path)

@app.errorhandler(400)
def bad_request(e): return jsonify({"error":"Bad request"}), 400
@app.errorhandler(404)
def not_found(e):   return jsonify({"error":"Not found"}), 404
@app.errorhandler(500)
def internal_error(e): return jsonify({"error":"Internal server error"}), 500

@app.route('/api/products_by_handles')
def products_by_handles():
    handles = request.args.get('handles', '')
    handle_list = [h.strip() for h in handles.split(',') if h.strip()]
    if not handle_list:
        return jsonify([])

    # Build GraphQL query
    queries = "\n".join([
        f'''
        h{i}: productByHandle(handle: "{handle}") {{
            id
            title
            handle
            description
            onlineStoreUrl
            featuredImage {{ url altText }}
            priceRange {{ minVariantPrice {{ amount currencyCode }} }}
        }}
        ''' for i, handle in enumerate(handle_list)
    ])
    query = f"{{{queries}}}"

    headers = {
        "X-Shopify-Storefront-Access-Token": STOREFRONT_TOKEN,
        "Content-Type": "application/json"
    }
    resp = requests.post(SHOPIFY_STOREFRONT_API, json={"query": query}, headers=headers)
    data = resp.json().get("data", {})
    products = [v for v in data.values() if v]
    return jsonify(products)

# ──────────────────────────────────────────────────────────────────────────────
# Cart Management Endpoints
# ──────────────────────────────────────────────────────────────────────────────

@app.route('/api/cart/create', methods=['POST'])
def create_cart():
    """Create a new cart page with items"""
    try:
        data = request.get_json()
        cart_items = data.get('items', [])
        user_info = data.get('user_info', {})
        
        if not cart_items:
            return jsonify({'error': 'No items provided'}), 400
        
        cart_id = create_cart_page(cart_items, user_info)
        
        return jsonify({
            'cart_id': cart_id,
            'cart_url': f'/cart/{cart_id}',
            'message': 'Cart created successfully'
        })
        
    except Exception as e:
        logger.error(f"Error creating cart: {e}")
        return jsonify({'error': 'Failed to create cart'}), 500

@app.route('/api/cart/<cart_id>', methods=['GET'])
def get_cart(cart_id):
    """Get cart data by ID"""
    try:
        if cart_id not in user_carts:
            return jsonify({'error': 'Cart not found'}), 404
        
        cart_data = user_carts[cart_id]
        return jsonify(cart_data)
        
    except Exception as e:
        logger.error(f"Error getting cart {cart_id}: {e}")
        return jsonify({'error': 'Failed to get cart'}), 500

@app.route('/api/cart/<cart_id>/update', methods=['PUT'])
def update_cart(cart_id):
    """Update cart items"""
    try:
        if cart_id not in user_carts:
            return jsonify({'error': 'Cart not found'}), 404
        
        data = request.get_json()
        new_items = data.get('items', [])
        
        # Update cart data
        cart_data = user_carts[cart_id]
        cart_data['items'] = new_items
        cart_data['total_price'] = sum(item.get('final_price', 0) for item in new_items)
        cart_data['item_count'] = len(new_items)
        cart_data['updated_at'] = datetime.now(timezone.utc).isoformat()
        
        user_carts[cart_id] = cart_data
        
        return jsonify({
            'cart_id': cart_id,
            'message': 'Cart updated successfully'
        })
        
    except Exception as e:
        logger.error(f"Error updating cart {cart_id}: {e}")
        return jsonify({'error': 'Failed to update cart'}), 500

@app.route('/cart/<cart_id>')
def serve_cart_page(cart_id):
    """Serve the cart page HTML"""
    if cart_id not in user_carts:
        return "Cart not found", 404
    
    cart_data = user_carts[cart_id]
    
    # Generate beautiful HTML for the cart page
    html = f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>My Cart - MamaTega Cosmetics</title>
        <style>
            * {{
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }}
            
            body {{
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
                padding: 20px;
            }}
            
            .cart-container {{
                max-width: 800px;
                margin: 0 auto;
                background: white;
                border-radius: 20px;
                box-shadow: 0 20px 40px rgba(0,0,0,0.1);
                overflow: hidden;
            }}
            
            .cart-header {{
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 30px;
                text-align: center;
            }}
            
            .cart-header h1 {{
                font-size: 2.5em;
                margin-bottom: 10px;
                font-weight: 300;
            }}
            
            .cart-id {{
                font-size: 1.2em;
                opacity: 0.9;
                font-family: monospace;
                margin-bottom: 10px;
                background: rgba(255, 255, 255, 0.2);
                padding: 5px 12px;
                border-radius: 15px;
                display: inline-block;
            }}
            
            .cart-info {{
                display: flex;
                flex-direction: column;
                gap: 5px;
                align-items: center;
            }}
            
            .persistent-badge {{
                background: rgba(255, 255, 255, 0.2);
                padding: 5px 12px;
                border-radius: 15px;
                font-size: 0.9em;
                font-weight: 600;
            }}
            
            .updated-info {{
                font-size: 0.8em;
                opacity: 0.8;
            }}
            
            .cart-items {{
                padding: 30px;
            }}
            
            .item {{
                display: flex;
                align-items: center;
                padding: 20px;
                border-bottom: 1px solid #eee;
                transition: all 0.3s ease;
            }}
            
            .item:hover {{
                background: #f8f9fa;
                transform: translateX(5px);
            }}
            
            .item-image-link {{
                text-decoration: none;
                color: inherit;
                display: block;
                margin-right: 20px;
                flex-shrink: 0;
            }}
            
            .item-image {{
                width: 80px;
                height: 80px;
                border-radius: 10px;
                object-fit: cover;
                border: 2px solid #e9ecef;
                transition: transform 0.3s ease;
            }}
            
            .item-image:hover {{
                transform: scale(1.05);
            }}
            
            .item-image-placeholder {{
                width: 80px;
                height: 80px;
                border-radius: 10px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-size: 2em;
            }}
            
            .item-details {{
                flex: 1;
            }}
            
            .item-title {{
                font-size: 1.2em;
                font-weight: 600;
                color: #333;
                margin-bottom: 5px;
            }}
            
            .item-title a {{
                color: #667eea;
                text-decoration: none;
                transition: color 0.3s ease;
            }}
            
            .item-title a:hover {{
                color: #5a6fd8;
                text-decoration: underline;
            }}
            
            .item-description {{
                color: #666;
                font-size: 0.85em;
                line-height: 1.4;
                margin-top: 5px;
                font-style: italic;
            }}
            
            .item-variant {{
                color: #666;
                font-size: 0.9em;
                margin-bottom: 5px;
            }}
            
            .item-price {{
                font-size: 1.1em;
                font-weight: 600;
                color: #667eea;
            }}
            
            .item-quantity {{
                background: #667eea;
                color: white;
                padding: 5px 12px;
                border-radius: 20px;
                font-size: 0.9em;
                font-weight: 600;
                margin-left: 20px;
            }}
            
            .cart-total {{
                background: #f8f9fa;
                padding: 30px;
                text-align: center;
                border-top: 2px solid #eee;
            }}
            
            .total-amount {{
                font-size: 2.5em;
                font-weight: 700;
                color: #667eea;
                margin-bottom: 10px;
            }}
            
            .total-label {{
                color: #666;
                font-size: 1.1em;
                margin-bottom: 20px;
            }}
            
            .action-buttons {{
                display: flex;
                gap: 15px;
                justify-content: center;
                flex-wrap: wrap;
            }}
            
            .btn {{
                padding: 15px 30px;
                border: none;
                border-radius: 25px;
                font-size: 1.1em;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.3s ease;
                text-decoration: none;
                display: inline-flex;
                align-items: center;
                gap: 10px;
            }}
            
            .btn-whatsapp {{
                background: #25D366;
                color: white;
            }}
            
            .btn-whatsapp:hover {{
                background: #128C7E;
                transform: translateY(-2px);
            }}
            
            .btn-instagram {{
                background: linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%);
                color: white;
            }}
            
            .btn-instagram:hover {{
                transform: translateY(-2px);
            }}
            
            .btn-copy {{
                background: #667eea;
                color: white;
            }}
            
            .btn-copy:hover {{
                background: #5a6fd8;
                transform: translateY(-2px);
            }}
            
            .store-info {{
                background: #f8f9fa;
                padding: 20px;
                text-align: center;
                border-top: 1px solid #eee;
            }}
            
            .store-info h3 {{
                color: #333;
                margin-bottom: 10px;
            }}
            
            .store-info p {{
                color: #666;
                line-height: 1.6;
            }}
            
            .order-instructions {{
                margin-top: 20px;
                padding: 20px;
                background: rgba(255, 255, 255, 0.1);
                border-radius: 10px;
                border-left: 4px solid #667eea;
            }}
            
            .order-instructions h4 {{
                color: white;
                margin-bottom: 15px;
                font-size: 1.1em;
            }}
            
            .order-instructions ol {{
                color: white;
                line-height: 1.8;
                margin-bottom: 20px;
            }}
            
            .order-instructions li {{
                margin-bottom: 8px;
            }}
            
            .contact-options {{
                background: rgba(255, 255, 255, 0.1);
                padding: 15px;
                border-radius: 8px;
                margin-top: 15px;
            }}
            
            .contact-options p {{
                color: white;
                margin: 5px 0;
                font-size: 0.95em;
            }}
            
            @media (max-width: 600px) {{
                .item {{
                    flex-direction: column;
                    text-align: center;
                }}
                
                .item-image {{
                    margin-right: 0;
                    margin-bottom: 15px;
                }}
                
                .item-quantity {{
                    margin-left: 0;
                    margin-top: 10px;
                }}
                
                .action-buttons {{
                    flex-direction: column;
                }}
                
                .btn {{
                    width: 100%;
                    justify-content: center;
                }}
            }}
        </style>
    </head>
    <body>
        <div class="cart-container">
            <div class="cart-header">
                <h1>🛒 My Cart</h1>
                <div class="cart-id">ID: {cart_id}</div>
                <div class="cart-info">
                    <span class="persistent-badge">🔗 Persistent Link</span>
                    <span class="updated-info">Last updated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')}</span>
                </div>
            </div>
            
            <div class="cart-items">
    """
    
    # Add items to HTML
    for item in cart_data['items']:
        item_name = item.get('product_title', 'Product')
        item_price = item.get('final_price', 0) / 100  # Convert from cents
        item_quantity = item.get('quantity', 1)
        item_image = item.get('product_image')
        item_url = item.get('product_url', '#')
        item_description = item.get('product_description', '')
        
        # Get variant info
        variant_options = item.get('variant_options', [])
        variant_text = ""
        if variant_options:
            valid_variants = [opt for opt in variant_options if opt.get('name') and opt.get('value')]
            if valid_variants:
                variant_text = " - " + ", ".join([f"{opt['name']}: {opt['value']}" for opt in valid_variants])
        
        # Use actual product image if available, otherwise use placeholder
        image_html = ""
        if item_image:
            image_html = f'<img src="{item_image}" alt="{item_name}" class="item-image">'
        else:
            image_html = '<div class="item-image-placeholder">🛍️</div>'
        
        html += f"""
                <div class="item">
                    <a href="{item_url}" target="_blank" class="item-image-link">
                        {image_html}
                    </a>
                    <div class="item-details">
                        <div class="item-title">
                            <a href="{item_url}" target="_blank">{item_name}</a>
                        </div>
                        <div class="item-variant">{variant_text}</div>
                        <div class="item-price">${item_price:.2f}</div>
                        {f'<div class="item-description">{item_description[:100]}{"..." if len(item_description) > 100 else ""}</div>' if item_description else ''}
                    </div>
                    <div class="item-quantity">Qty: {item_quantity}</div>
                </div>
        """
    
    total_price = cart_data['total_price'] / 100  # Convert from cents
    
    html += f"""
            </div>
            
            <div class="cart-total">
                <div class="total-label">Total Amount</div>
                <div class="total-amount">${total_price:.2f}</div>
                
                <div class="action-buttons">
                    <a href="https://wa.me/2348189880899?text=Hi MamaTega! I have items in my cart: {cart_id}. Can you help me complete my order?" class="btn btn-whatsapp">
                        📱 WhatsApp
                    </a>
                    <a href="https://www.instagram.com/mamategacosmeticsandspa/" class="btn btn-instagram">
                        📸 Instagram
                    </a>
                    <button onclick="copyCartLink()" class="btn btn-copy">
                        📋 Copy Link
                    </button>
                </div>
            </div>
            
            <div class="store-info">
                <h3>📍 MamaTega Cosmetics</h3>
                <p>Tejuosho Ultra Modern Shopping Centre, Mosque Plaza, Yaba, Lagos</p>
                <p>🕒 Mon–Sat: 8AM–8PM | Sun: 1PM–7PM</p>
                
                <div class="order-instructions">
                    <h4>📋 How to Order:</h4>
                    <ol>
                        <li><strong>Copy this cart link</strong> using the button above</li>
                        <li><strong>Open WhatsApp</strong> and message us at +234 818 988 0899</li>
                        <li><strong>Paste the cart link</strong> in your message</li>
                        <li><strong>Add any special requests</strong> or questions</li>
                        <li><strong>We'll confirm your order</strong> and arrange delivery</li>
                    </ol>
                    
                    <div class="contact-options">
                        <p><strong>📱 WhatsApp:</strong> +234 818 988 0899</p>
                        <p><strong>📸 Instagram:</strong> @mamategacosmeticsandspa</p>
                        <p><strong>🏪 Visit us:</strong> Tejuosho Ultra Modern Shopping Centre</p>
                    </div>
                </div>
            </div>
        </div>
        
        <script>
            function copyCartLink() {{
                navigator.clipboard.writeText(window.location.href).then(function() {{
                    alert('Cart link copied to clipboard!');
                }});
            }}
        </script>
    </body>
    </html>
    """
    
    return html

if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=int(os.getenv("PORT", "10000")),
        debug=True
    )
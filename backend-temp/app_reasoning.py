#!/usr/bin/env python3
import os, json, boto3, openai, numpy as np, re, random
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
from openai import OpenAIError, RateLimitError

# ── Load environment ──────────────────────────
load_dotenv()
openai.api_key       = os.getenv("OPENAI_API_KEY")
SHOPIFY_DOMAIN       = os.getenv("SHOPIFY_DOMAIN")
SHOPIFY_STORE_URL    = os.getenv("SHOPIFY_STORE_URL", f"https://{SHOPIFY_DOMAIN}")
EMBEDS_PATH          = os.getenv("EMBEDDINGS_PATH", "./product_embeddings.json")

app = Flask(__name__)
CORS(app)

# ── Static store context ──────────────────────
STORE_CONTEXT = """
You are an assistant for Mama Tega Cosmetics.

Store Details:
- Location: Tejuosho Ultra Modern Shopping Centre, Mosque Plaza, Yaba, Lagos
- Store Hours: Mon–Sat 8AM–8PM, Sun 1PM–7PM
- WhatsApp: 08189880899, 08037133704
- Orders: The online store shows only part of our product catalog. To get current prices and availability, customers must order via WhatsApp or Instagram.
- Instagram: @mamategacosmeticsandspa

Always answer clearly and kindly. If asked about shipping, how to order, ingredients, or hours — respond based on the store info. If the user asks for recommendations, list up to 3 relevant products if found.
"""

# ── Load product embeddings ───────────────────
def load_embeds(path):
    if path.startswith("s3://"):
        b, k = path[5:].split("/", 1)
        data = boto3.client("s3").get_object(Bucket=b, Key=k)["Body"].read()
        return json.loads(data)
    with open(path) as f:
        return json.load(f)

products = load_embeds(EMBEDS_PATH)
prod_matrix = np.asarray([p["embedding"] for p in products], dtype=np.float32)
prod_matrix /= np.linalg.norm(prod_matrix, axis=1, keepdims=True)
print(f"🧠 Loaded {len(products)} product embeddings")

# ── Embedding cache ───────────────────────────
_QUERY_CACHE = {}
_CACHE_ORDER = []

def cached_query_vec(q: str, max_size=500):
    qkey = q.lower().strip()
    if qkey in _QUERY_CACHE:
        _CACHE_ORDER.remove(qkey)
        _CACHE_ORDER.append(qkey)
        return _QUERY_CACHE[qkey]
    try:
        vec = openai.embeddings.create(
            model="text-embedding-3-small",
            input=qkey
        ).data[0].embedding
        vec = np.asarray(vec, dtype=np.float32)
        vec /= np.linalg.norm(vec)
        _QUERY_CACHE[qkey] = vec
        _CACHE_ORDER.append(qkey)
        if len(_CACHE_ORDER) > max_size:
            _QUERY_CACHE.pop(_CACHE_ORDER.pop(0), None)
        return vec
    except RateLimitError:
        return None
    except OpenAIError as e:
        print("[Embedding Error]", e)
        return None

# ── JSON parser ───────────────────────────────
def try_parse_json(raw):
    try:
        return json.loads(raw)
    except:
        match = re.search(r'\[\s*{.*?}\s*\]', raw, re.DOTALL)
        if match:
            try: return json.loads(match.group(0))
            except: pass
    return None

# ── /ask API route ────────────────────────────
@app.route("/ask", methods=["POST"])
def ask():
    data = request.get_json(force=True)
    user_q = data.get("prompt", "").strip()
    history = data.get("history", [])

    if not user_q:
        return jsonify({ "error": "No prompt received" }), 400

    # Embed query → get similar products
    q_vec = cached_query_vec(user_q)
    top_prods = []
    if q_vec is not None:
        sims = prod_matrix @ q_vec
        top_idx = sims.argsort()[-10:][::-1]
        top_prods = [products[i] for i in top_idx]
        random.shuffle(top_prods)

    # Product snippets
    product_list = "\n".join(
        f"{i+1}. {p['title']} (handle: {p['handle']})\n{p['description'][:250]}"
        for i, p in enumerate(top_prods)
    ) if top_prods else "No matching products found."

    # Build conversation
    messages = [{"role": "system", "content": STORE_CONTEXT}]
    for turn in history[-3:]:
        messages.append({ "role": "user", "content": turn.get("user", "") })
        messages.append({ "role": "assistant", "content": turn.get("bot", "") })

    messages.append({
        "role": "user",
        "content": f"{user_q}\n\nRelevant Products:\n{product_list}\n\nAnswer helpfully. If appropriate, recommend 2–3 products with a sentence about each. If user asked a store question, answer using the store details."
    })

    try:
        chat = openai.chat.completions.create(
            model="gpt-4o",
            temperature=0.7,
            messages=messages
        )
        reply = chat.choices[0].message.content.strip()
        print("🔎 AI Response:\n", reply[:300])

        product_cards = []
        for p in top_prods[:3]:
            product_cards.append({
                "title": p["title"],
                "handle": p["handle"],
                "link": f"{SHOPIFY_STORE_URL}/products/{p['handle']}",
                "image_url": p.get("image", {}).get("src", ""),
                "description": p["description"][:200]
            })

        return jsonify({
            "response": reply,
            "products": product_cards,
            "view_all_link": f"{SHOPIFY_STORE_URL}/search?q={user_q.replace(' ', '+')}"
        })

    except OpenAIError as e:
        print("❌ Chat error", e)
        return jsonify({ "error": str(e) }), 500

# ── Run local server ──────────────────────────
if __name__ == "__main__":
    app.run(port=int(os.getenv("PORT", "10000")), debug=True, host="0.0.0.0")
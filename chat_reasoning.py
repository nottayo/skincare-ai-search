# chat_reasoning.py

import os
import json
import re

# ── Load Behavior Rules from JSON ──
def load_behavior_rules(filename="behavior_rules.json") -> list[dict]:
    """
    Loads behavior rules from a JSON file located next to this script.
    Each rule must be a dict with 'when' and 'then' string keys.
    Returns a list of normalized rules.
    """
    base = os.path.dirname(__file__)
    path = os.path.join(base, filename)

    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, list):
            raise ValueError(f"{filename} must contain a JSON list of rules.")
    except Exception as e:
        print(f"⚠️ Failed to load behavior rules from {path}: {e}")
        return []

    rules = []
    for idx, rule in enumerate(data):
        when = rule.get("when")
        then = rule.get("then")
        if isinstance(when, str) and isinstance(then, str):
            w = when.strip().lower()
            t = then.strip()
            if w:
                rules.append({"when": w, "then": t})
        else:
            print(f"⚠️ Skipping invalid rule at index {idx}: {rule}")

    print(f"🔧 Loaded {len(rules)} behavior rules: {[r['when'] for r in rules]}")
    return rules


# ── Apply Matching Rule ──
def apply_behavior_rules(user_input: str, rules: list[dict]) -> str | None:
    """
    If any rule.when is a substring of user_input (case-insensitive),
    returns the rule.then text. Otherwise returns None.
    """
    text = user_input.strip().lower()
    for rule in rules:
        if rule["when"] in text:
            return rule["then"]
    return None


# ── Detect FAQs ──
def detect_faq(text: str) -> str | None:
    """
    Returns a canned FAQ answer if the text matches a known pattern.
    """
    faqs = {
        "store hours": "We're open Monday–Saturday from 9am to 6pm (GMT+1).",
        "return policy": "All sales are final unless the product is damaged on arrival.",
        "where is your store": "You can find us here: https://www.google.com/maps/dir//Mosque+Plaza,+Yaba,+Ojuelegba+Rd,+Lagos,+Nigeria/@6.5084749,3.3292045,13z",
        "do you deliver": "Yes, we deliver nationwide. For details or to arrange delivery, please contact your local store or reach out to us directly.",
    }
    lowered = text.strip().lower()
    for key, response in faqs.items():
        if key in lowered:
            return response
    return None


def is_best_product_query(text: str) -> bool:
    text = text.lower()
    return (
        ('best' in text or 'top' in text) and (
            'soap' in text or 'product' in text or 'serum' in text or 'cream' in text or 'lotion' in text
        )
    )


# ── GPT Prompt Builder ──
def build_gpt_prompt(user_query: str, top_products: list[dict]) -> str:
    """
    Constructs a prompt to send to GPT for recommending products.
    """
    if is_best_product_query(user_query):
        formatted = "\n".join(
            f"{i+1}. {p['title']} (handle: {p['handle']})"
            for i, p in enumerate(top_products)
        )
        return (
            f"User asked: \"{user_query}\"\n\n"
            "You're MamaTega's assistant helping users find suitable products. "
            "Use a friendly tone and suggest 2–3 matching products. Only mention the product names as clickable links. Do not include descriptions unless the user specifically asks for details.\n\n"
            "Here are the top products to consider:\n"
            f"{formatted}"
        )
    else:
        formatted = "\n".join(
            f"{i+1}. {p['title']} (handle: {p['handle']}) - {p['description'][:250]}"
            for i, p in enumerate(top_products)
        )
        return (
            f"User asked: \"{user_query}\"\n\n"
            "You're MamaTega's assistant helping users find suitable products. "
            "Use a friendly tone and suggest 2–3 matching products.\n\n"
            "Here are the top products to consider:\n"
            f"{formatted}"
        )


# ── GPT Response Parser ──
def parse_gpt_response(raw: str) -> list[dict]:
    """
    Attempts to parse a JSON array from raw GPT output.
    Falls back to regex extraction if direct json.loads fails.
    """
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return parsed
    except json.JSONDecodeError:
        match = re.search(r"\[\s*\{.*?\}\s*\]", raw, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(0))
            except json.JSONDecodeError:
                pass
    return []
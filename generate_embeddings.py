#!/usr/bin/env python3
"""
generate_embeddings.py
Fetch every product from Shopify and store OpenAI embeddings
in product_embeddings.json. Skips IDs already embedded.
"""

import os, json, requests, openai
from dotenv import load_dotenv

# ── Config ──────────────────────────────────────────────────────────────────
load_dotenv()
SHOPIFY_DOMAIN    = os.getenv("SHOPIFY_DOMAIN")          # mystore.myshopify.com
SHOPIFY_ADMIN_API = os.getenv("SHOPIFY_ADMIN_API")       # shpat_...
OPENAI_API_KEY    = os.getenv("OPENAI_API_KEY")
openai.api_key    = OPENAI_API_KEY

MAX_NEW_EMBEDS = 1_000          # limit per run

# ── Shopify helpers ─────────────────────────────────────────────────────────
def get_all_products() -> list[dict]:
    url   = f"https://{SHOPIFY_DOMAIN}/admin/api/2023-04/products.json?limit=250"
    hdr   = {"X-Shopify-Access-Token": SHOPIFY_ADMIN_API, "Content-Type":"application/json"}
    out   = []
    next_ = url
    while next_:
        r = requests.get(next_, headers=hdr, timeout=30)
        if r.status_code != 200:
            print("❌ Error:", r.text); break
        batch = r.json().get("products", [])
        if not batch: break
        out.extend(batch)
        print(f"[✓] Fetched {len(batch)} (total {len(out)})")
        next_ = None
        for part in r.headers.get("link","").split(","):
            if 'rel="next"' in part:
                s = part.find("<")+1; e = part.find(">", s)
                next_ = part[s:e]
                break
    print(f"📦 Total products fetched: {len(out)}")
    return out

# ── Embedding helpers ───────────────────────────────────────────────────────
def load_existing() -> list[dict]:
    return json.load(open("product_embeddings.json")) if os.path.exists("product_embeddings.json") else []

def save(payload: list[dict]):
    with open("product_embeddings.json","w",encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

def generate(products: list[dict], existing: list[dict]):
    output = existing.copy()
    done   = {p["id"] for p in existing}
    added  = 0

    for prod in products:
        if added >= MAX_NEW_EMBEDS:
            print(f"🚦 Hit {MAX_NEW_EMBEDS} limit."); break
        if prod["id"] in done:
            print(f"[⏩] Skip: {prod['title']}"); continue

        text = f"{prod.get('title','')}. {prod.get('body_html','')}"
        try:
            resp = openai.embeddings.create(
                model="text-embedding-3-small",
                input=text
            )
            embedding = resp.data[0].embedding
            output.append({
                "id":          prod["id"],
                "title":       prod.get("title",""),
                "description": prod.get("body_html",""),
                "handle":      prod.get("handle",""),
                "embedding":   embedding
            })
            added += 1
            print(f"[✓] Embedded ({added}/{MAX_NEW_EMBEDS}): {prod['title']}")
        except Exception as exc:
            print(f"[X] Failed '{prod.get('title','')}' → {exc}")

    save(output)
    print(f"✅ Added {added} new embeddings; product_embeddings.json saved.")

# ── Main ────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("🔍 Fetching products …")
    products  = get_all_products()
    existing  = load_existing()
    print(f"🧠 Embedding up to {MAX_NEW_EMBEDS} new products "
          f"(already have {len(existing)}).")
    generate(products, existing)
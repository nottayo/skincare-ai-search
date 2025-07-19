#!/usr/bin/env python3
"""
semantic_search.py
CLI helper to query Shopify product embeddings with cosine similarity.
• Loads embeddings from S3 or local JSON.
• Normalises vectors so similarity = fast dot-product.
"""

import os, json, boto3, openai, numpy as np
from dotenv import load_dotenv

# ── Env & keys ──────────────────────────────────────────────────────────────
load_dotenv()
openai.api_key   = os.getenv("OPENAI_API_KEY")
SHOPIFY_DOMAIN   = os.getenv("SHOPIFY_DOMAIN")
EMBEDDINGS_PATH  = os.getenv("EMBEDDINGS_PATH", "product_embeddings.json")

# ── Load embeddings ─────────────────────────────────────────────────────────
def load_embeddings(path: str):
    if path.startswith("s3://"):
        bucket, key = path[5:].split("/", 1)
        print(f"📥 Fetching embeddings from S3 → {bucket}/{key}")
        obj = boto3.client("s3").get_object(Bucket=bucket, Key=key)
        return json.loads(obj["Body"].read())
    print(f"📥 Loading embeddings from local file: {path}")
    return json.load(open(path, "r"))

# ── Query embedding (SDK 0.28) ──────────────────────────────────────────────
def embed_query(text: str) -> np.ndarray:
    resp = openai.Embedding.create(            # ← fixed call
        model="text-embedding-3-small",
        input=text
    )
    vec = np.array(resp.data[0].embedding, dtype=np.float32)
    return vec / np.linalg.norm(vec)

# ── Prepare product vectors once ────────────────────────────────────────────
def prepare_products(raw):
    out = []
    for p in raw:
        v = np.array(p["embedding"], dtype=np.float32)
        v /= np.linalg.norm(v)
        out.append((v, p))
    return out

try:
    _raw = load_embeddings(EMBEDDINGS_PATH)
except FileNotFoundError:
    print("❌ Embeddings file not found. Check EMBEDDINGS_PATH."); exit(1)

PRODUCTS = prepare_products(_raw)
print(f"🗃️  {len(PRODUCTS)} embeddings loaded and normalised")

# ── Search function ─────────────────────────────────────────────────────────
def semantic_search(query: str, k: int = 5):
    q_vec  = embed_query(query)
    scores = [(float(np.dot(q_vec, vec)), prod) for vec, prod in PRODUCTS]
    scores.sort(key=lambda x: x[0], reverse=True)
    return [p for _, p in scores[:k]]

# ── CLI demo loop ───────────────────────────────────────────────────────────
if __name__ == "__main__":
    while True:
        user_q = input("\n🔍  Type a search query (or 'exit'): ").strip()
        if user_q.lower() in ("exit", "quit", ""):
            break
        matches = semantic_search(user_q)
        print("\nTop matches:")
        for m in matches:
            link = f"https://{SHOPIFY_DOMAIN}/products/{m['handle']}"
            print(f"• {m['title']}  ↗ {link}")
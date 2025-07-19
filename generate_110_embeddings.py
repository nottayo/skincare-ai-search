import os
import json
import requests
import openai
from dotenv import load_dotenv
import sys

load_dotenv()

SHOPIFY_DOMAIN = os.getenv("SHOPIFY_DOMAIN")
SHOPIFY_ADMIN_API = os.getenv("SHOPIFY_ADMIN_API")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

openai.api_key = OPENAI_API_KEY

def get_first_n_products(limit=110):
    url = f"https://{SHOPIFY_DOMAIN}/admin/api/2023-04/products.json?limit=250"
    headers = {
        "X-Shopify-Access-Token": SHOPIFY_ADMIN_API,
        "Content-Type": "application/json"
    }

    all_products = []
    page_info = None

    while len(all_products) < limit:
        paged_url = url if not page_info else f"{url}&page_info={page_info}"
        response = requests.get(paged_url, headers=headers)

        if response.status_code != 200:
            print("❌ Error fetching products:", response.text)
            break

        products = response.json().get("products", [])
        if not products:
            break

        all_products.extend(products)
        print(f"[✓] Fetched {len(products)} products (Total so far: {len(all_products)})")

        # Handle Shopify pagination
        link_header = response.headers.get('link', '')
        if 'rel="next"' in link_header:
            start = link_header.find('page_info=') + len('page_info=')
            end = link_header.find('>', start)
            page_info = link_header[start:end]
        else:
            break

    return all_products[:limit]


def load_existing_embeddings():
    if not os.path.exists("product_embeddings.json"):
        return []
    with open("product_embeddings.json", "r") as f:
        return json.load(f)


def save_embeddings(data):
    with open("product_embeddings.json", "w") as f:
        json.dump(data, f, indent=2)


def generate_embeddings(products, existing_data):
    output = existing_data.copy()
    embedded_ids = {item["id"] for item in existing_data}

    for product in products:
        if product["id"] in embedded_ids:
            print(f"[⏩] Skipping already embedded: {product['title']}")
            continue

        title = product.get("title", "")
        description = product.get("body_html", "")
        text = f"{title}. {description}"

        try:
            resp = openai.embeddings.create(
                model="text-embedding-3-small",
                input=text
            )
            embedding = resp.data[0].embedding

            entry = {
                "id": product["id"],
                "title": title,
                "description": description,
                "handle": product.get("handle", ""),
                "embedding": embedding
            }

            output.append(entry)
            save_embeddings(output)
            print(f"[✓] Embedded and saved: {title}")

        except Exception as e:
            print(f"[X] Failed embedding for: {title} - {e}")

    print("✅ Embedding complete for 110 products.")


if __name__ == "__main__":
    # Accept limit as a command-line argument
    limit = 110
    if len(sys.argv) > 1:
        try:
            limit = int(sys.argv[1])
        except Exception:
            pass
    print(f"🔍 Fetching first {limit} products...")
    products = get_first_n_products(limit)
    existing_data = load_existing_embeddings()
    print(f"🧠 Starting embeddings (resuming from {len(existing_data)} already saved)...")
    generate_embeddings(products, existing_data)
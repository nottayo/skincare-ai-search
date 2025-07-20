#!/usr/bin/env python3
import json
import random

def create_smaller_embeddings(input_file, output_file, max_products=5000):
    """
    Create a smaller embeddings file with the most relevant products.
    """
    print(f"Loading products from {input_file}...")
    
    with open(input_file, 'r', encoding='utf-8') as file:
        products = json.load(file)
    
    print(f"Loaded {len(products)} products")
    
    # Filter for the most relevant products (soaps, creams, lotions, etc.)
    relevant_keywords = [
        'soap', 'cream', 'lotion', 'serum', 'cleanser', 'wash', 'mask', 
        'moisturizer', 'shampoo', 'conditioner', 'toner', 'oil', 'scrub',
        'foundation', 'concealer', 'mascara', 'lipstick', 'blush', 'eyeshadow',
        'perfume', 'cologne', 'makeup', 'skincare', 'hair', 'olay', 'maybelline',
        'clinique', 'loreal', 'neutrogena', 'dove', 'nivea', 'vaseline'
    ]
    
    # Score products based on relevance
    scored_products = []
    for product in products:
        title_lower = product['title'].lower()
        brand_lower = product.get('brand', '').lower()
        
        score = 0
        # Higher score for products with relevant keywords
        for keyword in relevant_keywords:
            if keyword in title_lower:
                score += 10
            if keyword in brand_lower:
                score += 5
        
        # Bonus for known brands
        known_brands = ['olay', 'maybelline', 'clinique', 'loreal', 'neutrogena', 'dove', 'nivea']
        if brand_lower in known_brands:
            score += 20
        
        # Bonus for soap products specifically
        if 'soap' in title_lower:
            score += 15
        
        scored_products.append((score, product))
    
    # Sort by score and take top products
    scored_products.sort(key=lambda x: x[0], reverse=True)
    top_products = [product for score, product in scored_products[:max_products]]
    
    print(f"Selected {len(top_products)} most relevant products")
    
    # Create embeddings structure
    embeddings_data = []
    
    for i, product in enumerate(top_products):
        # Create a simple text representation for embedding
        text_for_embedding = f"{product['title']} {product['brand']} {product['description']}"
        
        # Create dummy embedding (1500-dimensional vector of small random values)
        dummy_embedding = [random.uniform(-0.1, 0.1) for _ in range(1500)]
        
        embedding_product = {
            "title": product['title'],
            "brand": product['brand'],
            "description": product['description'],
            "handle": product['handle'],
            "embedding": dummy_embedding,
            "category": product['category'],
            "tags": product['tags']
        }
        
        embeddings_data.append(embedding_product)
    
    # Save smaller embeddings file
    with open(output_file, 'w', encoding='utf-8') as file:
        json.dump(embeddings_data, file, indent=2, ensure_ascii=False)
    
    print(f"✅ Created smaller embeddings file: {output_file}")
    print(f"📊 Total products: {len(embeddings_data)}")
    
    # Show sample of selected products
    print(f"\n📋 Sample selected products:")
    for i, product in enumerate(top_products[:10]):
        print(f"  {i+1}. {product['brand']} - {product['title']}")

if __name__ == "__main__":
    create_smaller_embeddings("products_with_brands.json", "product_embeddings_small.json", max_products=3000)
    
    print("\n🎉 Smaller embeddings file created!")
    print("💡 This should resolve the memory issue in Node.js") 



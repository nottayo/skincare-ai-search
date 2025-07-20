#!/usr/bin/env python3
import csv
import json
import re
from typing import Dict, List, Tuple

def extract_brand_from_product_name(product_name: str) -> str:
    """
    Extract brand name from product name using various patterns.
    """
    if not product_name or product_name.strip() == "":
        return "Unknown"
    
    product_name = product_name.strip()
    
    # Common brand patterns
    brand_patterns = [
        # Brands with special characters
        r'^([A-Z][a-z]+(?:\+[A-Z][a-z]+)*)',  # Malin+Goetz, etc.
        r'^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)',  # Maybelline Fit Me, etc.
        r'^([A-Z][a-z]+(?:\s+[0-9]+)*)',  # 212 Men, etc.
        r'^([0-9]+[A-Z][a-z]+)',  # 212Men, etc.
        r'^([A-Z][a-z]+(?:\s+[A-Z]+)*)',  # Creed Aventus, etc.
        r'^([A-Z]+(?:\s+[A-Z][a-z]+)*)',  # 2Sure, etc.
        r'^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+[A-Z]+)',  # Carolina Herrera, etc.
    ]
    
    # Known brand mappings
    brand_mappings = {
        'maybelline': 'Maybelline',
        'malin+goetz': 'Malin+Goetz',
        'carolina herrera': 'Carolina Herrera',
        'creed': 'Creed',
        '2sure': '2Sure',
        '55h+': '55H+',
        '212': '212',
        '1 million': '1 Million',
        'paco rabanne': 'Paco Rabanne',
        'cerutti': 'Cerutti',
        'cerruti': 'Cerruti',
        'morphe': 'Morphe',
        'clinique': 'Clinique',
        'olay': 'Olay',
        'loreal': 'L\'Oreal',
        'l\'oreal': 'L\'Oreal',
        'neutrogena': 'Neutrogena',
        'dove': 'Dove',
        'nivea': 'Nivea',
        'vaseline': 'Vaseline',
        'johnson': 'Johnson & Johnson',
        'johnson & johnson': 'Johnson & Johnson',
        'palmolive': 'Palmolive',
        'colgate': 'Colgate',
        'oral-b': 'Oral-B',
        'oral b': 'Oral-B',
        'gillette': 'Gillette',
        'schick': 'Schick',
        'bic': 'BIC',
        'revlon': 'Revlon',
        'covergirl': 'CoverGirl',
        'rimmel': 'Rimmel',
        'max factor': 'Max Factor',
        'maxfactor': 'Max Factor',
        'essence': 'Essence',
        'catrice': 'Catrice',
        'nyx': 'NYX',
        'wet n wild': 'Wet n Wild',
        'wet n wild': 'Wet n Wild',
        'elf': 'e.l.f.',
        'e.l.f': 'e.l.f.',
        'milani': 'Milani',
        'physicians formula': 'Physicians Formula',
        'physiciansformula': 'Physicians Formula',
        'hard candy': 'Hard Candy',
        'hardcandy': 'Hard Candy',
        'pop beauty': 'Pop Beauty',
        'popbeauty': 'Pop Beauty',
        'jordana': 'Jordana',
        'la colors': 'LA Colors',
        'la colors': 'LA Colors',
        'black radiance': 'Black Radiance',
        'blackradiance': 'Black Radiance',
        'imani': 'Iman',
        'black opal': 'Black Opal',
        'blackopal': 'Black Opal',
        'fashion fair': 'Fashion Fair',
        'fashionfair': 'Fashion Fair',
        'sacha': 'Sacha',
        'sacha cosmetics': 'Sacha',
        'sachacosmetics': 'Sacha',
    }
    
    # Try exact brand mappings first
    product_lower = product_name.lower()
    for brand_key, brand_name in brand_mappings.items():
        if brand_key in product_lower:
            return brand_name
    
    # Try pattern matching
    for pattern in brand_patterns:
        match = re.match(pattern, product_name)
        if match:
            potential_brand = match.group(1).strip()
            if len(potential_brand) > 1:  # Avoid single letters
                return potential_brand
    
    # If no pattern matches, try to extract first word as brand
    words = product_name.split()
    if words:
        first_word = words[0]
        # Clean up common prefixes/suffixes
        first_word = re.sub(r'^[0-9]+', '', first_word)  # Remove leading numbers
        first_word = re.sub(r'[^\w\s]', '', first_word)  # Remove special chars
        if first_word and len(first_word) > 1:
            return first_word.title()
    
    return "Unknown"

def clean_product_name(product_name: str) -> str:
    """
    Clean and normalize product name.
    """
    if not product_name:
        return ""
    
    # Remove extra whitespace and quotes
    cleaned = product_name.strip().strip('"').strip("'")
    
    # Remove empty lines and special characters
    cleaned = re.sub(r'^\s*$', '', cleaned)  # Remove empty lines
    cleaned = re.sub(r'^[-\s]+$', '', cleaned)  # Remove lines with only dashes/spaces
    
    return cleaned

def convert_csv_to_json(csv_file: str, json_file: str) -> None:
    """
    Convert CSV product file to JSON format with brand information.
    """
    products = []
    
    with open(csv_file, 'r', encoding='utf-8') as file:
        reader = csv.reader(file)
        
        for row_num, row in enumerate(reader, 1):
            if not row or len(row) == 0:
                continue
                
            product_name = row[0] if row[0] else ""
            product_name = clean_product_name(product_name)
            
            # Skip empty or invalid product names
            if not product_name or product_name == "" or product_name.lower() in ['product name', 'productname']:
                continue
            
            # Extract brand from product name
            brand = extract_brand_from_product_name(product_name)
            
            # Create product object
            product = {
                "id": row_num,
                "title": product_name,
                "brand": brand,
                "category": "Unknown",  # Can be enhanced later
                "description": f"{brand} {product_name}",
                "handle": product_name.lower().replace(' ', '-').replace('/', '-').replace('\\', '-'),
                "available": True,
                "price": 0.0,  # Can be enhanced later
                "compare_at_price": 0.0,  # Can be enhanced later
                "tags": [brand.lower()] if brand != "Unknown" else []
            }
            
            products.append(product)
    
    # Save to JSON file
    with open(json_file, 'w', encoding='utf-8') as file:
        json.dump(products, file, indent=2, ensure_ascii=False)
    
    print(f"✅ Converted {len(products)} products to {json_file}")
    print(f"📊 Sample products:")
    for i, product in enumerate(products[:5]):
        print(f"  {i+1}. {product['brand']} - {product['title']}")

def create_embeddings_json(json_file: str, embeddings_file: str) -> None:
    """
    Create embeddings JSON file compatible with the existing system.
    """
    with open(json_file, 'r', encoding='utf-8') as file:
        products = json.load(file)
    
    # Create embeddings structure (with dummy embeddings for now)
    embeddings_data = []
    
    for product in products:
        # Create a simple text representation for embedding
        text_for_embedding = f"{product['title']} {product['brand']} {product['description']}"
        
        # Create dummy embedding (1500-dimensional vector of small random values)
        import random
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
    
    # Save embeddings file
    with open(embeddings_file, 'w', encoding='utf-8') as file:
        json.dump(embeddings_data, file, indent=2, ensure_ascii=False)
    
    print(f"✅ Created embeddings file: {embeddings_file}")
    print(f"📊 Total products with embeddings: {len(embeddings_data)}")

if __name__ == "__main__":
    # Convert CSV to JSON
    convert_csv_to_json("productname.csv", "products_with_brands.json")
    
    # Create embeddings file
    create_embeddings_json("products_with_brands.json", "product_embeddings_with_brands.json")
    
    print("\n🎉 Conversion complete!")
    print("📁 Files created:")
    print("  - products_with_brands.json (main product data)")
    print("  - product_embeddings_with_brands.json (for AI search)")
    print("\n💡 Next steps:")
    print("  1. Review the brand extraction in products_with_brands.json")
    print("  2. Update the backend to use the new embeddings file")
    print("  3. Test the improved product search functionality") 


import csv
import json

input_file = 'Brands.csv'
output_file = 'brands_gpt35.jsonl'

with open(input_file, 'r', encoding='utf-8') as fin, open(output_file, 'w', encoding='utf-8') as fout:
    reader = csv.reader(fin)
    for row in reader:
        if not row or not row[0].strip() or row[0].startswith('#'):
            continue
        brand = row[0].strip()
        user_msg = f"Tell me about the brand {brand}."
        assistant_msg = f"{brand} is one of the brands we carry at MamaTega."
        messages = [
            {"role": "user", "content": user_msg},
            {"role": "assistant", "content": assistant_msg}
        ]
        json.dump({"messages": messages}, fout, ensure_ascii=False)
        fout.write('\n')

print(f"Converted {input_file} to {output_file}") 
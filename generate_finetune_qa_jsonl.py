import sys
import json
import os

if len(sys.argv) < 2:
    print('Usage: python generate_finetune_qa_jsonl.py <input.json>')
    sys.exit(1)

input_file = sys.argv[1]
if not input_file.endswith('.json'):
    print('Input file must be a .json file')
    sys.exit(1)

output_file = input_file.replace('.json', '_qa.jsonl')

with open(input_file, 'r', encoding='utf-8') as f:
    data = json.load(f)

with open(output_file, 'w', encoding='utf-8') as f:
    for prod in data:
        title = prod.get('title', '').strip()
        desc = prod.get('description', '').strip()
        if not title or not desc:
            continue
        qa = {
            "messages": [
                {"role": "system", "content": "You are a helpful assistant for MamaTega Cosmetics."},
                {"role": "user", "content": f"What is {title}?"},
                {"role": "assistant", "content": desc}
            ]
        }
        f.write(json.dumps(qa, ensure_ascii=False) + '\n')

print(f'Generated Q&A fine-tune data: {output_file}') 
import json

input_file = 'trainingdata.jsonl'
output_file = 'trainingdata_gpt35.jsonl'

with open(input_file, 'r', encoding='utf-8') as fin, open(output_file, 'w', encoding='utf-8') as fout:
    for line in fin:
        entry = json.loads(line)
        prompt = entry.get('prompt', '')
        completion = entry.get('completion', '').strip()

        # Extract user message from prompt
        if prompt.startswith('User:') and '\nAssistant:' in prompt:
            user_msg = prompt[len('User:'):prompt.index('\nAssistant:')].strip()
        else:
            # fallback: use the whole prompt
            user_msg = prompt.strip()

        messages = [
            {"role": "user", "content": user_msg},
            {"role": "assistant", "content": completion}
        ]
        json.dump({"messages": messages}, fout, ensure_ascii=False)
        fout.write('\n')

print(f"Converted data written to {output_file}") 
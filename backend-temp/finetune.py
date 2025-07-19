#!/usr/bin/env python3
import time
import os
import sys
from openai import OpenAI
from openai._client import OpenAIError

# ─────────── Configuration ───────────
TRAIN_FILE = "trainingdata_gpt35.jsonl"
BASE_MODEL = "gpt-3.5-turbo"
N_EPOCHS   = 4
BATCH_SIZE = 8
LR_MULT    = 0.1

def main():
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print("❌ Please set OPENAI_API_KEY", file=sys.stderr)
        sys.exit(1)

    client = OpenAI(api_key=api_key)

    # 1) Upload the file
    print("🔍 Uploading training file…")
    try:
        upload = client.files.create(
            file=open(TRAIN_FILE, "rb"),
            purpose="fine-tune"
        )
    except OpenAIError as e:
        print("❌ File upload failed:", e, file=sys.stderr)
        sys.exit(1)

    file_id = upload.id
    print(f"✅ Uploaded '{upload.filename}' as {file_id}")

    # 2) Create a fine-tune job
    print(f"🔍 Creating fine-tune job on {BASE_MODEL}…")
    try:
        job = client.fine_tuning.jobs.create(
            training_file=file_id,
            model=BASE_MODEL
        )
    except OpenAIError as e:
        print("❌ Could not start fine-tune:", e, file=sys.stderr)
        sys.exit(1)

    job_id = job.id
    print(f"🚀 Fine-tune job created: {job_id}")
    print("⏱️  Polling for job status…")

    # 3) Poll until it finishes
    while True:
        status = client.fine_tuning.jobs.retrieve(job_id)
        state  = status.status
        print(f"   • status: {state}     ", end="\r", flush=True)
        if state in ("succeeded", "failed"):
            print()
            break
        time.sleep(10)

    if state == "succeeded":
        fine_model = status.fine_tuned_model
        print(f"✅ Fine-tune succeeded! New model: {fine_model}")
    else:
        print(f"❌ Fine-tune failed. Full status:\n{status}")

if __name__ == "__main__":
    main()
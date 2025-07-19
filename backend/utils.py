import csv
import os
import json
import boto3
from datetime import datetime
from user_agents import parse as ua_parse

# ── Parse user-agent details ──
def parse_user_info(user_agent_str):
    ua = ua_parse(user_agent_str)
    return {
        "browser": ua.browser.family,
        "os": ua.os.family,
        "device": ua.device.family,
        "is_mobile": ua.is_mobile,
        "platform": ua.device.family if ua.device.family != "Other" else ua.os.family
    }

# ── Log user interaction ──
def log_interaction(row, file="training.csv"):
    exists = os.path.isfile(file)
    with open(file, "a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=row.keys())
        if not exists:
            writer.writeheader()
        writer.writerow(row)

# ── Load product embeddings from local or S3 ──
def load_product_embeddings(path):
    if path.startswith("s3://"):
        bucket, key = path[5:].split("/", 1)
        data = boto3.client("s3").get_object(Bucket=bucket, Key=key)["Body"].read()
        return json.loads(data)
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

# ── Get current GMT time string ──
def get_gmt_time():
    return datetime.utcnow().strftime("%I:%M %p GMT")
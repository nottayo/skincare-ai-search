# tests/test_app.py
import os
import json
import pytest
from unittest.mock import patch
from app import app, semantic_search, is_product_intent

@pytest.fixture
def client():
    app.config['TESTING'] = True
    with app.test_client() as c:
        yield c

def test_health(monkeypatch):
    # Assuming you add a /health endpoint
    resp = client().get('/health')
    assert resp.status_code == 200
    assert resp.json == {"status":"ok"}

def test_detect_faq_endpoint(client):
    resp = client.post('/ask', json={"prompt":"What are your store hours?"})
    assert resp.status_code == 200
    assert "Monday" in resp.json["answer"]

def test_brand_check_yes(client):
    # Mock known_brands or Shopify lookup
    with patch('app.known_brands', {'olay'}):
        resp = client.post('/ask', json={"prompt":"do you sell olay"})
        assert resp.status_code == 200
        assert resp.json["answer"] == "Yes—we carry products from **Olay**!"

def test_brand_check_no(client):
    with patch('app.known_brands', set()):
        resp = client.post('/ask', json={"prompt":"brand foo"})
        assert resp.status_code == 200
        assert "Sorry, we don’t stock" in resp.json["answer"]

def test_semantic_search_results():
    # Assuming embed_query and prod_matrix are set
    results = semantic_search("soap", k=2)
    assert isinstance(results, list) and len(results) <= 2
    for r in results:
        assert "title" in r and "link" in r

def test_full_qa_flow(monkeypatch, client):
    # Mock OpenAI chat
    fake_response = {
        "choices":[{"message":{"content":"Sure! Here are 3 soaps..."}}]
    }
    with patch('openai.ChatCompletion.create', return_value=fake_response):
        resp = client.post('/ask', json={"prompt":"soap", "sessionId":"123"})
        # First turn asks clarifier
        assert "what product type" in resp.json["answer"].lower()

        # Now clarify type and get products
        resp2 = client.post('/ask', json={"prompt":"bar soap", "sessionId":"123"})
        assert resp2.status_code == 200
        assert isinstance(resp2.json["results"], list)

def test_link_followup(monkeypatch, client):
    # Seed last_results
    app.config["last_results"] = {"sid": [{"link":"http://example.com"}]}
    resp = client.post('/ask', json={"prompt":"link","sessionId":"sid"})
    assert resp.json["answer"] == "http://example.com"

# ... you can extend tests for fallback, behavior rules, etc.

def test_health_endpoint(client):
    """Health endpoint returns OK."""
    resp = client.get('/health')
    assert resp.status_code == 200
    assert resp.json == {"status": "ok"}

def test_metrics_endpoint(client):
    """Metrics endpoint returns uptime and active_sessions."""
    resp = client.get('/metrics')
    assert resp.status_code == 200
    data = resp.json
    assert "uptime_seconds" in data
    assert "active_sessions" in data

def test_openapi_spec(client):
    """OpenAPI spec endpoint returns a minimal spec."""
    resp = client.get('/openapi.json')
    assert resp.status_code == 200
    assert resp.json["openapi"].startswith("3.0")

def test_bad_route(client):
    """404 for undefined routes."""
    resp = client.get('/no-such-route')
    assert resp.status_code == 404
    assert resp.json["error"] == "Not found"

def test_empty_prompt(client):
    """400 for empty prompt."""
    resp = client.post('/ask', json={"prompt": ""})
    assert resp.status_code == 400
    assert resp.json["error"] == "Prompt required"

def test_fallback_contact(client, monkeypatch):
    """If neither GPT nor semantic search returns, fallback to contact message."""
    # Force semantic_search to return empty
    monkeypatch.setattr('app.semantic_search', lambda q, k: [])
    # Mock GPT to return non-JSON so parse_gpt_response gives []
    fake = {"choices":[{"message":{"content":"No JSON here"}}]}
    monkeypatch.setattr('openai.ChatCompletion', 'create', lambda **_: fake)
    resp = client.post('/ask', json={"prompt": "some random query", "sessionId": "sid2"})
    assert resp.status_code == 200
    ans = resp.json["answer"]
    assert "I’m sorry, I couldn’t find that" in ans
    assert "08189880899" in ans

def test_semantic_search_typo_correction(monkeypatch):
    """Typo in product intent still yields results from semantic_search."""
    # monkeypatch embed_query to return the vector for "body wash"
    # simulate by returning same vec for any input
    vec = np.ones(prod_matrix.shape[1], dtype=np.float32)
    vec /= np.linalg.norm(vec)
    monkeypatch.setattr('app.embed_query', lambda q, k=3: vec)
    results = semantic_search("body wahs", k=2)
    assert len(results) == 2

def test_logging_creates_csv(tmp_path, monkeypatch):
    """Ensure log_interaction writes to CSV file."""
    log_file = tmp_path / "test_log.csv"
    monkeypatch.setenv("LOG_FILE", str(log_file))
    from utils import log_interaction as li
    li({
        "question": "test?",
        "detected_intent": "chat",
        "was_answered": True,
        "answer_snippet": "hi",
        "date": "2025-07-16",
        "time": "10:00",
        "user_ip": "1.2.3.4"
    })
    content = log_file.read_text()
    assert "test?" in content
    assert "hi" in content

# Add any further tests for edge cases, e.g. rate limiting, empty embeddings, etc.
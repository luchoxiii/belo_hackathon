import json
from collections import Counter
from decimal import Decimal
from pathlib import Path

import httpx
import pytest

import mcp_server
from dashboard import build_transactions_payload
from scoring_engine.demo import demo_raw

from conftest import counterparty, raw_data, receipt, self_contact, tx, SELF_CVU
from profiles import NOW

MOCK = json.loads((Path(__file__).parent.parent / "mocks" / "mock-transactions.json").read_text())
MOCK_TX_KEYS = {k for t in MOCK["transactions"] for k in t}
MOCK_CATEGORIES = {t["category"] for t in MOCK["transactions"]}
MOCK_METHODS = {t["method"] for t in MOCK["transactions"]}
REQUIRED_TX_KEYS = {"id", "type", "category", "amount", "currency", "amountArs",
                    "description", "method", "createdAt", "merchant"}


@pytest.fixture
def family():
    from scoring_engine import demo
    return build_transactions_payload(demo.family(NOW), "demo-family", "Usuario demo · Familia")


def test_same_shape_as_mock(family):
    assert family.keys() == MOCK.keys()
    assert family["profile"].keys() == MOCK["profile"].keys()
    assert family["stats"].keys() == MOCK["stats"].keys()
    assert family["dateRange"].keys() == MOCK["dateRange"].keys()
    for account in family["accounts"]:
        assert {"id", "type", "name", "currency", "balance"} <= account.keys()
        assert account["balance"].keys() == {"currency", "available", "updatedAt"}
    for t in family["transactions"]:
        assert REQUIRED_TX_KEYS <= t.keys() <= MOCK_TX_KEYS
        assert t["type"] in {"debit", "credit"}
        assert t["method"] in MOCK_METHODS
        # Números JSON como en el mock, no strings
        assert isinstance(t["amount"], (int, float)) and isinstance(t["amountArs"], int)


def test_family_categories_use_mock_vocabulary(family):
    categories = Counter(t["category"] for t in family["transactions"])
    assert set(categories) <= MOCK_CATEGORIES
    for expected in ("salario", "freelance", "alquiler", "expensas", "luz", "debito_prepaga",
                     "tarjeta_supermercado", "debito_netflix", "compra_crypto"):
        assert expected in categories


def test_family_stats_and_profile(family):
    txs = family["transactions"]
    assert family["stats"]["totalTransactions"] == len(txs)
    assert family["stats"]["totalIncome"] == sum(t["amountArs"] for t in txs if t["type"] == "credit")
    assert family["stats"]["totalExpenses"] == sum(t["amountArs"] for t in txs if t["type"] == "debit")
    assert [t["createdAt"] for t in txs] == sorted(t["createdAt"] for t in txs)
    employment = family["profile"]["employment"]
    assert employment["company"] == "Tech Solutions SA"
    assert employment["monthlySalary"] == 2800000 and employment["payDay"] == 5
    assert family["profile"]["familyMembers"] == [] and family["profile"]["location"] is None


def test_card_and_crypto_details(family):
    card = next(t for t in family["transactions"] if t["category"] == "tarjeta_supermercado")
    assert card["card"] == {"last4": "4532", "brand": "visa"} and card["method"] == "tarjeta_debito"
    swap = next(t for t in family["transactions"] if t["category"] == "compra_crypto")
    assert swap["crypto"]["asset"] == "USDT" and swap["method"] == "crypto" and swap["type"] == "debit"
    assert swap["amountArs"] == 300000


def test_no_account_identifiers_leak(family):
    dumped = json.dumps(family)
    assert "tech.solutions.sueldos" not in dumped    # alias del pagador
    assert "alias" not in dumped


def test_usdt_amounts_get_amount_ars_from_fx():
    raw = raw_data(
        transactions=[tx("deposit", amount="100", currency="USDT", created_at="2026-09-15T12:00:00Z",
                         receipt_=receipt(counterparty=counterparty("CVU", "x")))],
        fx_rates={"ARS": {"2026-09-15": "1500"}},
    )
    [t] = build_transactions_payload(raw, "s")["transactions"]
    assert (t["currency"], t["amount"], t["amountArs"]) == ("USDT", 100, 150000)


def test_self_transfers_and_pending_are_hidden():
    txs = [tx("transfer", receipt_=receipt(counterparty=counterparty("CVU", SELF_CVU))),
           tx("transfer", status="pending", receipt_=receipt(counterparty=counterparty("ALIAS", "x")))]
    payload = build_transactions_payload(raw_data(transactions=txs, contacts=[self_contact()]), "s")
    assert payload["transactions"] == []
    assert payload["stats"]["totalTransactions"] == 0


def test_every_demo_profile_builds():
    for profile in ("salaried", "erratic", "short_history", "family"):
        assert build_transactions_payload(demo_raw(profile), profile)["version"] == "1.0.0"


# Endpoint HTTP

def http_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=mcp_server.app), base_url="http://test")


async def test_endpoint_serves_demo_profile(monkeypatch):
    monkeypatch.setenv("BELO_DEMO_PROFILE", "family")
    async with http_client() as client:
        response = await client.get("/api/dashboard/transactions")
    assert response.status_code == 200
    body = response.json()
    assert body["profile"]["name"] == "Usuario demo · Familia"
    assert body["stats"]["totalTransactions"] > 100


async def test_endpoint_requires_credential_without_demo(monkeypatch):
    monkeypatch.delenv("BELO_DEMO_PROFILE", raising=False)
    async with http_client() as client:
        response = await client.get("/api/dashboard/transactions")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "missing_credential"


async def test_endpoint_cors_for_dashboard_origin(monkeypatch):
    monkeypatch.setenv("BELO_DEMO_PROFILE", "family")
    async with http_client() as client:
        preflight = await client.options("/api/dashboard/transactions", headers={
            "Origin": "http://localhost:3000", "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "X-Belo-Api-Key"})
        other = await client.get("/api/dashboard/transactions", headers={"Origin": "https://evil.example"})
    assert preflight.status_code == 200
    assert preflight.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert "access-control-allow-origin" not in other.headers


# OpenAPI / Swagger

def _schema(name: str) -> dict:
    from dashboard.openapi import openapi_spec
    spec = openapi_spec()
    return {"$ref": f"#/components/schemas/{name}", "components": spec["components"]}


def test_openapi_spec_is_valid():
    from openapi_spec_validator import validate
    from dashboard.openapi import openapi_spec
    validate(openapi_spec())


def test_every_demo_payload_matches_response_schema():
    from jsonschema import Draft202012Validator
    validator = Draft202012Validator(_schema("TransactionsResponse"))
    for profile in ("salaried", "erratic", "short_history", "family"):
        errors = list(validator.iter_errors(build_transactions_payload(demo_raw(profile), profile)))
        assert errors == [], (profile, [e.message for e in errors[:3]])


def test_spec_example_matches_schema_and_is_family():
    from jsonschema import Draft202012Validator
    from dashboard.openapi import openapi_spec
    content = openapi_spec()["paths"]["/api/dashboard/transactions"]["get"]["responses"]["200"]["content"]
    example = content["application/json"]["examples"]["family"]["value"]
    Draft202012Validator(_schema("TransactionsResponse")).validate(example)
    assert {"card", "crypto"} <= {k for t in example["transactions"] for k in t}
    assert {t["type"] for t in example["transactions"]} == {"debit", "credit"}


def test_error_responses_match_schema():
    from jsonschema import Draft202012Validator
    validator = Draft202012Validator(_schema("ErrorResponse"))
    validator.validate({"error": {"code": "missing_credential", "message": "x"}})


async def test_docs_and_spec_are_served():
    async with http_client() as client:
        spec = await client.get("/api/dashboard/openapi.json")
        docs = await client.get("/api/dashboard/docs")
    assert spec.status_code == 200 and spec.json()["openapi"] == "3.1.0"
    assert docs.status_code == 200 and "swagger-ui-bundle.js" in docs.text
    assert 'url: "/api/dashboard/openapi.json"' in docs.text

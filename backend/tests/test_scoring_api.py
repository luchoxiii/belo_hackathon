import json

import httpx
import pytest
from jsonschema import Draft202012Validator

import mcp_server
from dashboard.openapi import openapi_spec
from scoring_engine import config
from scoring_engine.explain import explain_decision, methodology
from scoring_engine.service import demo_decision

PROFILES = ("salaried", "erratic", "short_history", "family")


def validator(name: str) -> Draft202012Validator:
    spec = openapi_spec()
    return Draft202012Validator({"$ref": f"#/components/schemas/{name}", "components": spec["components"]})


def http_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=mcp_server.app), base_url="http://test")


# Explicación de una decisión

@pytest.mark.parametrize("profile", PROFILES)
def test_explanation_matches_schema(profile):
    validator("ScoringProfile").validate(explain_decision(demo_decision(profile), demo=True))


def test_profile_has_score_without_breakdown():
    out = explain_decision(demo_decision("family"))
    assert out["score"] == {"value": 700, "band": "B", "base": config.BASE_SCORE, "max": 860}
    assert "breakdown" not in out and "features" not in out
    assert [r["feature"] for r in out["reasons"]] == ["runway_months", "history_months", "net_margin"]


def test_rejected_explanation_has_no_score():
    out = explain_decision(demo_decision("short_history"))
    assert out["eligible"] is False
    assert out["rejections"] == [{"code": "short_history",
                                  "message": "Necesitamos al menos 3 meses de movimientos en tu cuenta"}]
    assert out["score"] is None and out["offer"] is None


def test_low_score_explains_missing_offer():
    out = explain_decision(demo_decision("erratic"))
    assert out["offer"] is None
    assert out["no_offer_reason"]["code"] == "low_score"


def test_explanation_has_no_sensitive_data():
    dumped = json.dumps(explain_decision(demo_decision("family")))
    for forbidden in ("subject_id", "demo-family", "tech.solutions", "counterparty", '"pep"'):
        assert forbidden not in dumped


# Metodología

def test_methodology_matches_schema_and_config():
    m = methodology()
    validator("Methodology").validate(m)
    assert m["deterministic"] is True and m["llm_involved"] is False
    assert m["scorecard_version"] == config.SCORECARD_VERSION
    assert [f["feature"] for f in m["score"]["features"]] == list(config.SCORECARD_BINS)
    assert m["score"]["max"] == 860
    assert {g["code"] for g in m["eligibility_gates"]} == set(config.REJECTION_TEXT)
    assert [b["band"] for b in m["bands"]] == ["A", "B", "C", "D"]


def test_spec_examples_match_schemas():
    paths = openapi_spec()["paths"]
    for path, schema in (("/api/scoring/profile", "ScoringProfile"), ("/api/scoring/methodology", "Methodology")):
        examples = paths[path]["get"]["responses"]["200"]["content"]["application/json"]["examples"]
        for example in examples.values():
            validator(schema).validate(example["value"])


# Endpoints HTTP

async def test_profile_endpoint_with_demo(monkeypatch):
    monkeypatch.setenv("BELO_DEMO_PROFILE", "family")
    async with http_client() as client:
        default = await client.get("/api/scoring/profile")
        six = await client.get("/api/scoring/profile", params={"term_months": 6})
        bad = await client.get("/api/scoring/profile", params={"term_months": "seis"})
    assert default.status_code == 200
    body = default.json()
    assert body["demo"] is True and body["score"]["band"] == "B"
    assert six.json()["offer"]["term_months"] == 6
    assert bad.status_code == 400 and bad.json()["error"]["code"] == "invalid_term_months"


async def test_profile_endpoint_requires_credential(monkeypatch):
    monkeypatch.delenv("BELO_DEMO_PROFILE", raising=False)
    async with http_client() as client:
        response = await client.get("/api/scoring/profile")
    assert response.status_code == 401


async def test_methodology_endpoint_needs_no_credential(monkeypatch):
    monkeypatch.delenv("BELO_DEMO_PROFILE", raising=False)
    async with http_client() as client:
        response = await client.get("/api/scoring/methodology")
        docs = await client.get("/api/docs")
    assert response.status_code == 200 and response.json()["llm_involved"] is False
    assert docs.status_code == 200 and "swagger-ui-bundle.js" in docs.text

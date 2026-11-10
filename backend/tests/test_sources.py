import httpx
import pytest

import mcp_server
from belo_scoring import categorize
from belo_scoring.models import Category
from dashboard import build_transactions_payload
from scoring_engine import decide
from scoring_engine.features import monotributo_status
from scoring_engine.scorecard import score
from sources.belo import BeloRepository, as_profile
from sources.dummy import DummyContext, DummyRepository, own_key
from sources.models import Direction, MovementKind
from sources.registry import DUMMY_SOURCES, catalog, dummy_source_ids, load_profile, profile_from_raw

from profiles import NOW, salaried

ALL = list(DUMMY_SOURCES)


def full_profile(subject="user-1", ids=ALL):
    return profile_from_raw(salaried(), subject, ids)


def test_registry_has_the_eleven_sources():
    assert set(ALL) == {"mercado_pago", "modo", "uala", "naranja_x", "onlyfans", "cuenta_dni",
                        "uber", "pedidos_ya", "rappi", "rapipago_pagofacil", "monotributo"}
    assert [s.id for s in catalog()][0] == "belo"
    assert all(not s.live for s in catalog()[1:])


def test_every_source_generates_data_inside_the_window():
    raw = salaried()
    for source_id, repo in DUMMY_SOURCES.items():
        data = repo.build("user-1", raw.window_from, raw.window_to)
        assert data.movements, source_id
        assert all(m.source == source_id and m.id.startswith(f"{source_id}:") for m in data.movements)
        assert all(raw.window_from <= m.occurred_at < raw.window_to for m in data.movements)
        assert data.live is False


def test_dummy_data_is_deterministic_per_user():
    a1, a2, b = full_profile("user-a"), full_profile("user-a"), full_profile("user-b")
    amounts = lambda p: [(m.id, m.amount) for m in p.movements]
    assert amounts(a1) == amounts(a2)
    assert amounts(a1) != amounts(b)


def test_same_user_can_earn_and_spend_on_one_platform():
    movements = [m for m in full_profile().movements if m.source == "pedidos_ya"]
    assert {m.kind for m in movements} == {MovementKind.PAYOUT, MovementKind.PURCHASE}
    by_id = {m.id: m for m in categorize(full_profile())}
    assert {by_id[m.id].subcategory for m in movements} == {"platform", "platform_purchase"}


def test_transfer_between_own_sources_is_internal():
    movements = categorize(full_profile(ids=["uala", "mercado_pago"]))
    funding = [m for m in movements if m.provider in ("uala", "mercado_pago") and "cuenta propia" in (m.counterparty_name or "")]
    assert funding and all(m.category == Category.INTERNAL and m.subcategory == "self_transfer" for m in funding)
    # Del lado de Mercado Pago no cuenta como ingreso
    assert not any(m.category == Category.INCOME and "cuenta propia" in (m.counterparty_name or "") for m in movements)


def test_new_features_from_sources():
    belo_only = decide(salaried(), "u").features
    assert belo_only.income_source_count == 1
    assert belo_only.bill_payment_regularity == 0
    assert belo_only.monotributo_status == "not_registered"

    features = decide(full_profile(), "u").features
    assert features.income_source_count >= 6
    assert features.bill_payment_regularity >= 0.8   # Rapipago/PagoFácil casi todos los meses
    assert features.monotributo_status in {"up_to_date", "in_debt"}
    assert features.platform_income_share > 0


def test_monotributo_adjustment():
    assert monotributo_status({}) == "not_registered"
    assert monotributo_status({"monotributo": {"registered": True, "up_to_date": True}}) == "up_to_date"
    assert monotributo_status({"monotributo": {"registered": True, "up_to_date": False}}) == "in_debt"
    f = decide(salaried(), "u").features
    points = {s: next(c.points for c in score(f.model_copy(update={"monotributo_status": s})).contributions
                      if c.feature == "monotributo")
              for s in ("up_to_date", "in_debt", "not_registered")}
    assert points == {"up_to_date": 30, "in_debt": -30, "not_registered": 0}


def test_more_sources_change_the_score():
    assert decide(salaried(), "u").score.score != decide(full_profile(), "u").score.score


def test_decision_reports_dummy_sources():
    belo_only = decide(as_profile(salaried()), "u")
    assert [s["id"] for s in belo_only.sources] == ["belo"]
    sources = decide(full_profile(), "u").sources
    assert {s["id"] for s in sources} == {"belo", *ALL}
    assert all(not s["live"] for s in sources)   # belo del perfil demo también es sintético


def test_dashboard_marks_source_and_methods():
    payload = build_transactions_payload(full_profile(), "u")
    txs = payload["transactions"]
    assert {t["source"] for t in txs} >= {"belo", "uber", "rapipago_pagofacil", "naranja_x"}
    assert {t["method"] for t in txs if t["source"] == "naranja_x"} == {"tarjeta_credito"}
    assert {t["method"] for t in txs if t["source"] == "rapipago_pagofacil"} == {"efectivo"}
    platform = {t["category"] for t in txs if t["source"] in ("uber", "pedidos_ya", "rappi") and t["type"] == "credit"}
    assert platform == {"ingreso_plataforma"}   # las liquidaciones no se confunden con sueldo
    assert {"source"} <= payload["accounts"][-1].keys()


def test_dummy_sources_env(monkeypatch):
    monkeypatch.delenv("DUMMY_SOURCES", raising=False)
    assert dummy_source_ids() == ALL
    assert dummy_source_ids("salaried") == []
    monkeypatch.setenv("DUMMY_SOURCES", "none")
    assert dummy_source_ids() == []
    monkeypatch.setenv("DUMMY_SOURCES", "uber, modo")
    assert dummy_source_ids("family") == ["uber", "modo"]
    monkeypatch.setenv("DUMMY_SOURCES", "uber,banelco")
    with pytest.raises(ValueError, match="banelco"):
        dummy_source_ids()


async def test_load_profile_combines_belo_and_dummies():
    async def loader():
        return salaried()

    profile = await load_profile("user-1", BeloRepository(loader), ["uber", "monotributo"])
    assert [s.id for s in profile.sources] == ["belo", "uber", "monotributo"]
    assert "monotributo" in profile.facts
    assert {m.source for m in profile.movements} == {"belo", "uber", "monotributo"}


def test_adding_a_source_is_one_class(monkeypatch):
    class BancoDemoRepository(DummyRepository):
        id = "banco_demo"
        name = "Banco Demo"

        def generate(self, ctx: DummyContext) -> None:
            for month in ctx.months():
                ctx.add(MovementKind.TRANSFER, Direction.IN, month, 10, ctx.ars(100000, 100000), "Banco Demo SA",
                        rail="CBU")

    monkeypatch.setitem(DUMMY_SOURCES, "banco_demo", BancoDemoRepository())
    profile = profile_from_raw(salaried(), "u", ["banco_demo"])
    income = [m for m in categorize(profile) if m.provider == "banco_demo"]
    assert income and all(m.category == Category.INCOME for m in income)


def test_own_key_is_stable():
    assert own_key("uala", "u") == own_key("uala", "u") != own_key("uala", "v")


async def test_sources_endpoint(monkeypatch):
    monkeypatch.setenv("BELO_DEMO_PROFILE", "erratic")
    monkeypatch.delenv("DUMMY_SOURCES", raising=False)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=mcp_server.app), base_url="http://t") as c:
        body = (await c.get("/api/sources")).json()
    connected = {s["id"] for s in body["sources"] if s["connected"]}
    assert connected == {"belo", "uber", "pedidos_ya", "rappi", "onlyfans", "mercado_pago"}
    assert len(body["sources"]) == 12


async def test_sources_endpoint_matches_schema(monkeypatch):
    from jsonschema import Draft202012Validator
    from dashboard.openapi import openapi_spec
    monkeypatch.delenv("BELO_DEMO_PROFILE", raising=False)
    monkeypatch.delenv("DUMMY_SOURCES", raising=False)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=mcp_server.app), base_url="http://t") as c:
        assert (await c.get("/api/sources")).status_code == 401   # sin usuario no hay conexiones
        body = (await c.get("/api/sources", headers={"X-Belo-Api-Key": "belo_live_x"})).json()
    spec = openapi_spec()
    Draft202012Validator({"$ref": "#/components/schemas/SourcesResponse", "components": spec["components"]}).validate(body)
    assert all(s["connected"] for s in body["sources"])   # usuario real: belo + todas las dummy


def test_multisource_payloads_match_schemas():
    from jsonschema import Draft202012Validator
    from dashboard.openapi import openapi_spec
    from scoring_engine.explain import explain_decision
    components = openapi_spec()["components"]
    validate = lambda name, value: Draft202012Validator(
        {"$ref": f"#/components/schemas/{name}", "components": components}).validate(value)
    validate("TransactionsResponse", build_transactions_payload(full_profile(), "u"))
    validate("ScoringProfile", explain_decision(decide(full_profile(), "u")))


# Conectar / desconectar fuentes desde el dashboard

def client() -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=mcp_server.app), base_url="http://t")


def connected(body: dict) -> set[str]:
    return {s["id"] for s in body["sources"] if s["connected"]}


async def test_connecting_a_source_updates_dashboard_and_score(monkeypatch):
    monkeypatch.setenv("BELO_DEMO_PROFILE", "salaried")   # default: solo belo
    async with client() as c:
        assert connected((await c.get("/api/sources")).json()) == {"belo"}
        before_tx = (await c.get("/api/dashboard/transactions")).json()
        before_score = (await c.get("/api/scoring/profile")).json()

        body = (await c.post("/api/sources/uber")).json()
        assert connected(body) == {"belo", "uber"}
        after_tx = (await c.get("/api/dashboard/transactions")).json()
        after_score = (await c.get("/api/scoring/profile")).json()

        body = (await c.delete("/api/sources/uber")).json()
        assert connected(body) == {"belo"}
        back_tx = (await c.get("/api/dashboard/transactions")).json()

    assert {t["source"] for t in before_tx["transactions"]} == {"belo"}
    assert "uber" in {t["source"] for t in after_tx["transactions"]}
    assert after_tx["stats"]["totalIncome"] > before_tx["stats"]["totalIncome"]
    assert [s["id"] for s in after_score["sources"]] == ["belo", "uber"]
    assert after_score["score"] != before_score["score"] or after_score["offer"] != before_score["offer"]
    assert back_tx["stats"] == before_tx["stats"]


async def test_connections_are_per_user():
    a, b = {"X-Belo-Api-Key": "belo_live_a"}, {"X-Belo-Api-Key": "belo_live_b"}
    async with client() as c:
        await c.delete("/api/sources/onlyfans", headers=a)
        sources_a = connected((await c.get("/api/sources", headers=a)).json())
        sources_b = connected((await c.get("/api/sources", headers=b)).json())
    assert "onlyfans" not in sources_a and "onlyfans" in sources_b


async def test_toggle_errors(monkeypatch):
    monkeypatch.setenv("BELO_DEMO_PROFILE", "salaried")
    async with client() as c:
        unknown = await c.post("/api/sources/banelco")
        belo = await c.delete("/api/sources/belo")
    monkeypatch.delenv("BELO_DEMO_PROFILE")
    async with client() as c:
        anonymous = await c.post("/api/sources/uber")
    assert unknown.status_code == 404 and unknown.json()["error"]["code"] == "unknown_source"
    assert belo.status_code == 409 and belo.json()["error"]["code"] == "cannot_disconnect"
    assert anonymous.status_code == 401


async def test_real_user_profile_uses_saved_connections(connection_store):
    from scoring_engine.decision import subject_id_for
    from scoring_engine.service import clear_cache, get_profile
    clear_cache()
    calls = []

    async def fetcher(key):
        calls.append(key)
        return salaried()

    subject = subject_id_for("belo_live_r")
    assert {s.id for s in (await get_profile("belo_live_r", fetcher)).sources} == {"belo", *ALL}
    connection_store.set(subject, ["monotributo"])
    assert [s.id for s in (await get_profile("belo_live_r", fetcher)).sources] == ["belo", "monotributo"]
    assert calls == ["belo_live_r"]   # belo cacheado: cambiar fuentes no vuelve a llamar a la API
    clear_cache()


def test_json_file_store(tmp_path):
    from sources.connections import JsonFileConnectionStore
    path = tmp_path / "connections.json"
    store = JsonFileConnectionStore(path)
    assert store.get("u") is None
    store.set("u", ["uber"])
    assert JsonFileConnectionStore(path).get("u") == ["uber"]   # persiste en disco
    store.set("u", [])
    assert store.get("u") == []                                 # vacío != nunca configurado

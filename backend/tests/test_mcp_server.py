import pytest
from fastmcp import Client
from fastmcp.exceptions import ToolError

import mcp_server
from scoring_engine import service

from profiles import salaried


@pytest.fixture(autouse=True)
def fake_belo(monkeypatch):
    """Sin red: la decisión sale del perfil sintético."""
    monkeypatch.delenv("BELO_DEMO_PROFILE", raising=False)
    service.clear_cache()

    async def get_decision(api_key, term_months=None):
        async def fetcher(_):
            return salaried()
        return await service.get_decision(api_key, term_months, fetcher=fetcher)

    monkeypatch.setattr(mcp_server, "get_decision", get_decision)
    yield
    service.clear_cache()


async def test_only_read_tools_are_exposed():
    async with Client(mcp_server.mcp) as client:
        names = {t.name for t in await client.list_tools()}
    assert names == {
        "get_savings_projection", "get_goal_projection", "get_promotions", "simulate_goal_with_promo",
        "get_credit_profile", "get_preapproved_offer", "simulate_loan",
    }
    for verb in ("transfer", "swap", "confirm", "disburse", "payout"):
        assert not any(verb in n for n in names)


async def test_credit_tools_require_user_credential(monkeypatch):
    monkeypatch.delenv("BELO_ALLOW_SERVER_CREDENTIAL", raising=False)
    async with Client(mcp_server.mcp) as client:
        with pytest.raises(ToolError, match="Conectá tu cuenta belo"):
            await client.call_tool("get_credit_profile", {})


async def test_demo_profile_needs_no_credential(monkeypatch):
    monkeypatch.delenv("BELO_ALLOW_SERVER_CREDENTIAL", raising=False)
    monkeypatch.setenv("BELO_DEMO_PROFILE", "salaried")
    async with Client(mcp_server.mcp) as client:
        offer = (await client.call_tool("get_preapproved_offer", {})).data
    assert offer["has_offer"] and offer["demo"] is True


async def test_unknown_demo_profile_is_a_tool_error(monkeypatch):
    monkeypatch.setenv("BELO_DEMO_PROFILE", "nope")
    async with Client(mcp_server.mcp) as client:
        with pytest.raises(ToolError, match="Perfil demo desconocido"):
            await client.call_tool("get_credit_profile", {})


async def test_credit_tools_with_demo_credential(monkeypatch):
    monkeypatch.setenv("BELO_ALLOW_SERVER_CREDENTIAL", "true")
    async with Client(mcp_server.mcp) as client:
        profile = (await client.call_tool("get_credit_profile", {})).data
        offer = (await client.call_tool("get_preapproved_offer", {"term_months": 6})).data
        sim = (await client.call_tool("simulate_loan", {"amount_usd": "800.00", "term_months": 6})).data
        with pytest.raises(ToolError, match="El monto debe estar"):
            await client.call_tool("simulate_loan", {"amount_usd": "99999", "term_months": 6})
    assert profile["band"] == "A" and profile["has_preapproved_offer"]
    assert offer["offer"]["term_months"] == 6
    assert len(sim["simulation"]["schedule"]) == 6

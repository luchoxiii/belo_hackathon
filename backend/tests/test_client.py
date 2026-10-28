import ast
from datetime import date
from pathlib import Path

import httpx
import pytest
import respx

from belo_client import BeloAPIError, BeloAuthError, BeloClient
from belo_scoring.fetch import fetch_raw
from belo_scoring.fx_source import ARGENTINADATOS_URL

from conftest import BASE_URL, tx

SRC = Path(__file__).parent.parent / "src"
ARGENTINADATOS = ARGENTINADATOS_URL.format(casa="oficial")


class FakeSleep:
    def __init__(self):
        self.calls: list[float] = []

    async def __call__(self, seconds: float) -> None:
        self.calls.append(seconds)


def client(sleep=None) -> BeloClient:
    return BeloClient(sleep=sleep or FakeSleep())


def page(items, next_page):
    return {"data": items, "pagination": {"total": 0, "limit": 100, "currentPage": 1,
                                          "nextPage": next_page, "prevPage": None}}


@respx.mock
async def test_auth_header_and_base_url():
    route = respx.get(f"{BASE_URL}/account/balances").respond(json={"data": []})
    async with client() as belo:
        await belo.get_balances()
    assert route.calls.last.request.headers["Authorization"] == "ApiKey belo_live_test"


@respx.mock
async def test_pagination_until_next_page_null():
    route = respx.get(f"{BASE_URL}/transactions")
    route.side_effect = [
        httpx.Response(200, json=page([tx("deposit", id_="1")], 2)),
        httpx.Response(200, json=page([tx("deposit", id_="2")], 3)),
        httpx.Response(200, json=page([tx("deposit", id_="3")], None)),
    ]
    async with client() as belo:
        items = await belo.paginate("transactions")
    assert [i["id"] for i in items] == ["1", "2", "3"]
    assert [c.request.url.params["page"] for c in route.calls] == ["1", "2", "3"]
    assert all(c.request.url.params["limit"] == "100" for c in route.calls)


@respx.mock
async def test_429_respects_retry_after():
    route = respx.get(f"{BASE_URL}/vaults")
    route.side_effect = [
        httpx.Response(429, headers={"Retry-After": "3"},
                       json={"error": {"type": "rate_limit", "code": "rate_limited", "message": "x"}}),
        httpx.Response(200, json={"data": []}),
    ]
    sleep = FakeSleep()
    async with client(sleep) as belo:
        assert await belo.get("vaults") == {"data": []}
    assert 3.0 in sleep.calls


@respx.mock
async def test_vault_calls_are_spaced_one_second():
    respx.get(f"{BASE_URL}/vaults/1").respond(json={"id": "1"})
    respx.get(f"{BASE_URL}/vaults/2").respond(json={"id": "2"})
    sleep = FakeSleep()
    async with client(sleep) as belo:
        await belo.get("vault", vault_id="1")
        await belo.get("vault", vault_id="2")
    assert len(sleep.calls) == 1 and 0.9 < sleep.calls[0] <= 1.0


@respx.mock
async def test_500_retries_with_exponential_backoff_then_fails():
    route = respx.get(f"{BASE_URL}/contacts").respond(500)
    sleep = FakeSleep()
    async with client(sleep) as belo:
        with pytest.raises(BeloAPIError) as e:
            await belo.get("contacts")
    assert e.value.status_code == 500
    assert route.call_count == 4          # 1 + 3 reintentos
    assert sleep.calls == [0.5, 1.0, 2.0]


@respx.mock
async def test_502_then_success():
    route = respx.get(f"{BASE_URL}/contacts")
    route.side_effect = [httpx.Response(502), httpx.Response(200, json={"data": []})]
    async with client() as belo:
        assert await belo.get("contacts") == {"data": []}


@respx.mock
async def test_401_aborts_without_retry():
    route = respx.get(f"{BASE_URL}/contacts").respond(
        401, json={"error": {"type": "authentication_error", "code": "invalid_api_key", "message": "x"}})
    async with client() as belo:
        with pytest.raises(BeloAuthError) as e:
            await belo.get("contacts")
    assert e.value.code == "invalid_api_key"
    assert route.call_count == 1
    assert "belo_live_test" not in str(e.value)


async def test_unknown_endpoint_is_rejected():
    async with client() as belo:
        with pytest.raises(BeloAPIError):
            await belo.get("swaps_preview")


def _mock_full_api(router, cards_status=200):
    router.get(f"{BASE_URL}/transactions").respond(json=page([tx("deposit", id_="t1")], None))
    router.get(f"{BASE_URL}/contacts").respond(json={"data": []})
    router.get(f"{BASE_URL}/account/balances").respond(json={"data": []})
    if cards_status == 200:
        router.get(f"{BASE_URL}/cards").respond(json={"data": [{"id": "296"}]})
        router.get(f"{BASE_URL}/cards/application").respond(json={"status": "approved", "acceptedTerms": True})
    else:
        error = {"error": {"type": "authorization_error", "code": "card_not_allowed", "message": "x"}}
        router.get(f"{BASE_URL}/cards").respond(cards_status, json=error)
        router.get(f"{BASE_URL}/cards/application").respond(cards_status, json=error)
    router.get(f"{BASE_URL}/cards/296/transactions").respond(json=page([
        {"id": "new", "status": "success", "amount": "10", "currency": "USD", "description": "A",
         "createdAt": "2099-01-01T00:00:00Z"},
        {"id": "old", "status": "success", "amount": "10", "currency": "USD", "description": "B",
         "createdAt": "2000-01-01T00:00:00Z"},
    ], 2))
    router.get(f"{BASE_URL}/vaults").respond(json={"data": [{"id": "1295"}]})
    router.get(f"{BASE_URL}/vaults/1295").respond(json={"id": "1295", "earned": {}})
    router.get(ARGENTINADATOS).respond(json=[
        {"casa": "oficial", "compra": 1480, "venta": 1530, "fecha": "2000-01-01"},
        {"casa": "oficial", "compra": 1480, "venta": 1530.5, "fecha": date.today().isoformat()},
    ])


async def test_fetch_raw_only_uses_get():
    with respx.mock(assert_all_called=False) as router:
        # Cualquier método no-GET a cualquier URL queda registrado acá
        catch_all = router.route(method__in=["POST", "PUT", "PATCH", "DELETE"]).respond(500)
        _mock_full_api(router)
        async with client() as belo:
            raw = await fetch_raw(30, client=belo)
        # Las llamadas se resetean al salir del context manager
        assert not catch_all.called
        assert router.calls.call_count > 0
        assert {c.request.method for c in router.calls} == {"GET"}
    assert [t["id"] for t in raw.transactions] == ["t1"]
    # Corta la paginación al salir de la ventana y filtra lo viejo
    assert [t["id"] for t in raw.card_transactions["296"]] == ["new"]
    assert raw.vault_details["1295"]["id"] == "1295"
    # Cotizaciones de la ventana, sin pasar por float
    assert raw.fx_rates["ARS"] == {date.today().isoformat(): "1505.25"}
    assert raw.unavailable == {}


async def test_fx_source_failure_is_not_fatal():
    with respx.mock(assert_all_called=False) as router:
        _mock_full_api(router)
        router.get(ARGENTINADATOS).respond(503)
        async with client() as belo:
            raw = await fetch_raw(30, client=belo)
    assert raw.fx_rates == {}
    assert raw.unavailable == {"fx_rates": "fx_source_error"}


async def test_cards_403_is_not_fatal():
    with respx.mock(assert_all_called=False) as router:
        _mock_full_api(router, cards_status=403)
        async with client() as belo:
            raw = await fetch_raw(30, client=belo)
    assert raw.unavailable == {"cards": "card_not_allowed", "card_application": "card_not_allowed"}
    assert raw.cards == [] and raw.card_application is None
    assert [t["id"] for t in raw.transactions] == ["t1"]


def test_source_never_calls_write_methods():
    """Ningún archivo del cliente, del scoring ni del MCP llama post/put/patch/delete/request."""
    forbidden = {"post", "put", "patch", "delete", "request", "send", "stream"}
    files = [SRC / "belo_client.py", SRC / "mcp_server.py",
             *(SRC / "belo_scoring").glob("*.py"), *(SRC / "scoring_engine").glob("*.py")]
    for path in files:
        for node in ast.walk(ast.parse(path.read_text())):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
                assert node.func.attr not in forbidden, f"{path.name}: .{node.func.attr}()"

"""Fixtures armados con los ejemplos del OpenAPI de belo."""

from datetime import datetime, timezone
from typing import Any

import pytest

from belo_scoring.models import RawData

BASE_URL = "https://belo.test/api/v1"
SELF_CVU = "0000003100010000000001"
SELF_WALLET = "0x7e85bf28742e26fb4e18d1574f95288186b16c00"


@pytest.fixture(autouse=True)
def belo_env(monkeypatch):
    monkeypatch.setenv("BELO_API_KEY", "belo_live_test")
    monkeypatch.setenv("BELO_BASE_URL", "https://belo.test")
    monkeypatch.delenv("DUMMY_SOURCES", raising=False)


@pytest.fixture(autouse=True)
def connection_store():
    """Los tests nunca escriben en backend/data/connections.json."""
    from sources.connections import InMemoryConnectionStore
    from sources.registry import set_store
    store = InMemoryConnectionStore()
    set_store(store)
    yield store
    set_store(None)


def receipt(**overrides: Any) -> dict[str, Any]:
    base = {
        "counterparty": None,
        "debits": [],
        "netAmount": None,
        "netCurrency": None,
        "fee": None,
        "feeCurrency": None,
        "taxes": None,
        "taxCurrency": None,
        "conversion": None,
        "network": None,
        "transactionHash": None,
        "explorerUrl": None,
        "bankReference": None,
    }
    return {**base, **overrides}


def counterparty(account_type: str | None, account: str | None = None, belotag: str | None = None,
                 name: str | None = "Proveedor SA") -> dict[str, Any]:
    return {"name": name, "bank": None, "belotag": belotag, "account": account, "accountType": account_type}


def tx(type_: str, amount: str = "100.00", currency: str = "USDT", status: str = "success",
       receipt_: dict | None | str = "default", created_at: str = "2026-09-15T12:00:00.000Z",
       id_: str | None = None, metadata: dict | None = None) -> dict[str, Any]:
    return {
        "id": id_ or f"{type_}-{created_at}-{amount}",
        "type": type_,
        "status": status,
        "amount": amount,
        "currency": currency,
        "metadata": metadata,
        "receipt": receipt() if receipt_ == "default" else receipt_,
        "createdAt": created_at,
        "updatedAt": created_at,
    }


def self_contact() -> dict[str, Any]:
    return {
        "id": "c-self",
        "name": "Yo",
        "nickname": None,
        "belotag": "yo.mismo",
        "isFavorite": False,
        "tier": "self",
        "lastTransferAt": None,
        "accounts": [
            {"currency": "ARS", "ownerName": "Yo", "addresses": [
                {"addressType": "CVU", "address": SELF_CVU, "network": None, "country": None, "fields": []},
            ]},
            {"currency": "USDT", "ownerName": None, "addresses": [
                {"addressType": "ETHEREUM", "address": SELF_WALLET, "network": "ETHEREUM", "country": None, "fields": []},
            ]},
        ],
    }


def raw_data(**overrides: Any) -> RawData:
    now = datetime(2026, 10, 28, tzinfo=timezone.utc)
    return RawData(
        fetched_at=now,
        window_from=datetime(2026, 5, 1, tzinfo=timezone.utc),
        window_to=now,
        **overrides,
    )

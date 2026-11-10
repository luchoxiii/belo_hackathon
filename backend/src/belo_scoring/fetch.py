"""
Recolección (I/O): llama a los endpoints de belo y devuelve las respuestas tal cual.

Separada de la categorización y la agregación para poder iterar las reglas
desde disco sin volver a pegarle a la API.
"""

import json
import os
from collections.abc import Awaitable, Callable
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, TypeVar

import httpx

from belo_client import BeloAPIError, BeloAuthError, BeloClient

from sources.models import parse_datetime
from .fx_source import fetch_ars_rates
from .models import RawData

T = TypeVar("T")

# 403 (no habilitado) y 404: la categoría queda "no disponible", sin romper el perfil
OPTIONAL_STATUS = {403, 404}

RAW_FILES = [
    "transactions", "contacts", "cards", "card_transactions", "card_application",
    "balances", "vaults", "vault_details", "fx_rates",
]

FxFetcher = Callable[[date, date], Awaitable[dict[str, str]]]


async def _optional(raw: RawData, name: str, call: Awaitable[T], default: T) -> T:
    try:
        return await call
    except BeloAuthError:
        raise
    except BeloAPIError as e:
        if e.status_code in OPTIONAL_STATUS:
            raw.unavailable[name] = e.code or str(e.status_code)
            return default
        raise


async def fetch_raw(
    window_days: int = 180,
    client: BeloClient | None = None,
    fx_fetcher: FxFetcher | None = fetch_ars_rates,
) -> RawData:
    """Llama a todos los endpoints (solo GET) y devuelve las respuestas crudas."""
    now = datetime.now(timezone.utc)
    raw = RawData(
        fetched_at=now,
        window_from=now - timedelta(days=window_days),
        window_to=now,
        declared_brackets={
            "annual_revenue": os.getenv("BELO_DECLARED_ANNUAL_REVENUE") or None,
            "monthly_card_spend": os.getenv("BELO_DECLARED_MONTHLY_CARD_SPEND") or None,
        },
    )
    window = {
        "from": raw.window_from.isoformat().replace("+00:00", "Z"),
        "to": raw.window_to.isoformat().replace("+00:00", "Z"),
    }

    def older_than_window(item: dict[str, Any]) -> bool:
        return parse_datetime(item["createdAt"]) < raw.window_from

    owns_client = client is None
    client = client or BeloClient()
    try:
        raw.transactions = await client.paginate("transactions", window)
        raw.contacts = (await client.get("contacts")).get("data", [])
        raw.balances = await client.get_balances()

        raw.cards = (await _optional(raw, "cards", client.get("cards"), {})).get("data", [])
        for card in raw.cards:
            card_id = str(card["id"])
            # Sin filtro de fecha en la API: lista de más nuevo a más viejo, cortamos al salir de la ventana
            txs = await _optional(
                raw, f"card_transactions/{card_id}",
                client.paginate("card_transactions", stop=older_than_window, card_id=card_id),
                [],
            )
            raw.card_transactions[card_id] = [t for t in txs if not older_than_window(t)]
        raw.card_application = await _optional(raw, "card_application", client.get("card_application"), None)

        # Vaults: rate limit 1 req/s, el cliente serializa las llamadas
        raw.vaults = (await _optional(raw, "vaults", client.get("vaults"), {})).get("data", [])
        for vault in raw.vaults:
            vault_id = str(vault["id"])
            detail = await _optional(raw, f"vault/{vault_id}", client.get("vault", vault_id=vault_id), None)
            if detail is not None:
                raw.vault_details[vault_id] = detail
    finally:
        if owns_client:
            await client.aclose()

    # Cotizaciones ARS/USD de la ventana (+7 días para cubrir fines de semana)
    if fx_fetcher is not None:
        try:
            ars = await fx_fetcher((raw.window_from - timedelta(days=7)).date(), raw.window_to.date())
            if ars:
                raw.fx_rates["ARS"] = ars
        except (httpx.HTTPError, ValueError):
            raw.unavailable["fx_rates"] = "fx_source_error"
    return raw


def save_raw(raw: RawData, directory: Path) -> None:
    """Guarda cada respuesta en `<directory>/<endpoint>.json` y los metadatos en `_meta.json`."""
    directory.mkdir(parents=True, exist_ok=True)
    data = raw.model_dump(mode="json")
    for name in RAW_FILES:
        (directory / f"{name}.json").write_text(json.dumps(data.pop(name), indent=2, ensure_ascii=False))
    (directory / "_meta.json").write_text(json.dumps(data, indent=2, ensure_ascii=False))


def load_raw(directory: Path) -> RawData:
    data = json.loads((directory / "_meta.json").read_text())
    for name in RAW_FILES:
        path = directory / f"{name}.json"
        if path.exists():
            data[name] = json.loads(path.read_text())
    return RawData.model_validate(data)

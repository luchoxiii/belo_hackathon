"""
Normalización de montos a USD.

Orden: stablecoins 1:1 -> `receipt.conversion` del movimiento -> FxProvider.
"""

from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Any, Protocol

# ARGt y ARS son la misma moneda; BRAt y BRL también
CURRENCY_ALIASES = {"ARGt": "ARS", "BRAt": "BRL"}
USD_PEGGED = {"USD", "USDT", "USDC"}


class FxProvider(Protocol):
    def get_rate(self, currency: str, at: datetime) -> Decimal | None:
        """Cuántas unidades de `currency` vale 1 USD en `at` (ej. ARS -> 1450)."""
        ...


class StubFxProvider:
    """
    PENDIENTE: la API de belo no expone cotizaciones históricas.
    Hasta definir la fuente, los montos en ARS/BRL quedan sin normalizar.
    """

    def get_rate(self, currency: str, at: datetime) -> Decimal | None:
        return None


def normalize_currency(currency: str | None) -> str | None:
    if currency is None:
        return None
    return CURRENCY_ALIASES.get(currency, currency)


def to_decimal(value: Any) -> Decimal | None:
    if value is None or value == "":
        return None
    try:
        return Decimal(str(value))
    except InvalidOperation:
        return None


def _from_conversion(amount: Decimal, currency: str, conversion: dict | None) -> Decimal | None:
    """Usa el precio de la conversión cuando un lado del par es USD."""
    if not conversion or not conversion.get("pairCode"):
        return None
    price = to_decimal(conversion.get("price"))
    if not price:
        return None
    try:
        base, quote = (normalize_currency(c) for c in conversion["pairCode"].split("/"))
    except ValueError:
        return None
    # price = cuánto `quote` vale 1 `base`
    if currency == quote and base in USD_PEGGED:
        return amount / price
    if currency == base and quote in USD_PEGGED:
        return amount * price
    return None


def to_usd(
    amount: Decimal | None,
    currency: str | None,
    at: datetime,
    fx: FxProvider,
    conversion: dict | None = None,
) -> Decimal | None:
    if amount is None or currency is None:
        return None
    currency = normalize_currency(currency)
    if currency in USD_PEGGED:
        return amount
    if amount == 0:
        return Decimal(0)
    converted = _from_conversion(amount, currency, conversion)
    if converted is not None:
        return converted
    rate = fx.get_rate(currency, at)
    if not rate:
        return None
    return amount / rate

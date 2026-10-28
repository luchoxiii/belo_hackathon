"""
Modelo canónico multi-source: lo que cualquier fuente de datos (belo, billeteras,
plataformas, ARCA...) entrega al pipeline de scoring y al dashboard.

Montos en Decimal, nunca float. No depende de ningún proveedor.
"""

from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field


class Direction(str, Enum):
    IN = "in"     # entra plata a la cuenta del usuario
    OUT = "out"   # sale plata


class MovementKind(str, Enum):
    TRANSFER = "transfer"   # transferencia / depósito / retiro por un rail (CVU, alias, QR, on-chain...)
    CARD = "card"           # consumo (o reintegro) con tarjeta
    SWAP = "swap"           # conversión entre monedas de la misma cuenta
    BILL = "bill"           # pago de servicios (luz, gas, teléfono...), por ej. en Rapipago/PagoFácil
    TAX = "tax"             # impuestos / Monotributo
    PAYOUT = "payout"       # liquidación de una plataforma (viajes, repartos, contenido)
    PURCHASE = "purchase"   # compra dentro de una plataforma (delivery, viajes, suscripciones, e-commerce)


class Movement(BaseModel):
    id: str                          # único entre fuentes: "<source>:<id nativo>"
    source: str                      # id de la fuente: "belo", "mercado_pago", ...
    kind: MovementKind
    direction: Direction | None      # None en swaps
    status: Literal["success", "pending", "failed"]
    occurred_at: datetime
    amount: Decimal | None           # en egresos, total debitado (fee e impuestos incluidos)
    currency: str
    fee: Decimal | None = None
    fee_currency: str | None = None
    taxes: Decimal | None = None
    tax_currency: str | None = None
    debits: dict[str, Decimal] = Field(default_factory=dict)  # pagos multi-moneda
    rail: str | None = None          # CVU, ALIAS, BELOTAG, TRON, QR, CASH, CARD, PLATFORM...
    counterparty_name: str | None = None
    counterparty_key: str | None = None            # para recurrencia (cuenta, alias, belotag)
    counterparty_ids: list[str] = Field(default_factory=list)  # todas las claves, para detectar cuentas propias
    description: str | None = None
    conversion: dict[str, Any] | None = None       # swaps: pairCode, type, price, baseAmount, quoteAmount
    card_last4: str | None = None
    card_brand: str | None = None
    raw_type: str                    # tipo original en la fuente
    has_receipt: bool = True         # False = datos incompletos (ej. receipt null en belo)


class BalanceRecord(BaseModel):
    source: str
    account_id: str
    kind: Literal["wallet", "vault"]
    name: str
    currency: str
    available: Decimal
    earned_total: Decimal | None = None
    earned_month: Decimal | None = None
    rate: str | None = None
    goal_amount: Decimal | None = None


class SourceData(BaseModel):
    """Lo que devuelve un repository."""

    source: str
    live: bool                        # False = datos dummy
    movements: list[Movement] = Field(default_factory=list)
    balances: list[BalanceRecord] = Field(default_factory=list)
    own_accounts: set[str] = Field(default_factory=set)       # claves de cuentas propias (minúscula)
    facts: dict[str, Any] = Field(default_factory=dict)        # datos no transaccionales (ej. Monotributo)
    fx_rates: dict[str, dict[str, str]] = Field(default_factory=dict)
    declared_brackets: dict[str, str | None] = Field(default_factory=dict)
    card_application_status: str | None = None
    unavailable: dict[str, str] = Field(default_factory=dict)


class SourceInfo(BaseModel):
    id: str
    name: str
    live: bool


class ProfileData(BaseModel):
    """Todas las fuentes conectadas de un usuario, combinadas."""

    fetched_at: datetime
    window_from: datetime
    window_to: datetime
    sources: list[SourceInfo] = Field(default_factory=list)
    movements: list[Movement] = Field(default_factory=list)
    balances: list[BalanceRecord] = Field(default_factory=list)
    own_accounts: set[str] = Field(default_factory=set)
    facts: dict[str, dict[str, Any]] = Field(default_factory=dict)   # por fuente
    fx_rates: dict[str, dict[str, str]] = Field(default_factory=dict)
    declared_brackets: dict[str, str | None] = Field(default_factory=dict)
    card_application_status: str | None = None
    unavailable: dict[str, str] = Field(default_factory=dict)        # "<source>:<endpoint>" -> código

    @property
    def uses_dummy_data(self) -> bool:
        return any(not s.live for s in self.sources)


def parse_datetime(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))

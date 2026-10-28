"""Modelos del módulo de scoring. Montos siempre en Decimal, nunca float."""

from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field


class Category(str, Enum):
    INCOME = "income"        # plata que entra de terceros
    EXPENSE = "expense"      # plata que sale a terceros o se consume
    SAVINGS = "savings"      # stock: saldos, vaults, rendimientos
    INTERNAL = "internal"    # movimientos neutros: no son ingreso ni gasto
    EXCLUDED = "excluded"    # no se cuentan (pending, failed, sin datos)


class RawData(BaseModel):
    """Respuestas crudas de la API, tal cual. `unavailable` = endpoint -> código de error."""

    fetched_at: datetime
    window_from: datetime
    window_to: datetime
    transactions: list[dict[str, Any]] = Field(default_factory=list)
    contacts: list[dict[str, Any]] = Field(default_factory=list)
    cards: list[dict[str, Any]] = Field(default_factory=list)
    card_transactions: dict[str, list[dict[str, Any]]] = Field(default_factory=dict)
    card_application: dict[str, Any] | None = None
    balances: list[dict[str, Any]] = Field(default_factory=list)
    vaults: list[dict[str, Any]] = Field(default_factory=list)
    vault_details: dict[str, dict[str, Any]] = Field(default_factory=dict)
    # Rangos declarados: la API no los devuelve, vienen de variables de entorno
    declared_brackets: dict[str, str | None] = Field(default_factory=dict)
    unavailable: dict[str, str] = Field(default_factory=dict)


class CategorizedMovement(BaseModel):
    id: str
    source: Literal["ledger", "card"]
    occurred_at: datetime
    category: Category
    subcategory: str
    amount: Decimal
    currency: str
    amount_usd: Decimal | None
    fee: Decimal | None
    fee_currency: str | None = None
    taxes: Decimal | None
    tax_currency: str | None = None
    # Desglose de `receipt.debits` por moneda (pagos multi-moneda)
    debits: dict[str, Decimal] = Field(default_factory=dict)
    counterparty_name: str | None
    counterparty_key: str | None   # account, belotag o address, para detectar recurrencia
    raw_type: str                  # type original de belo
    data_quality: Literal["full", "partial"]  # partial si receipt es null o falta FX
    # Swaps: par BASE/QUOTE y dirección (BUY/SELL), señal de comportamiento
    swap_pair: str | None = None
    swap_direction: str | None = None
    # Tarjeta: comercio, para una categorización futura
    description: str | None = None


class BalanceSnapshot(BaseModel):
    currency: str
    available: Decimal
    available_usd: Decimal | None
    earned_total: Decimal
    earned_month: Decimal
    earned_total_usd: Decimal | None
    earned_month_usd: Decimal | None
    rate: str | None


class VaultSnapshot(BaseModel):
    id: str
    name: str | None
    currency: str
    balance: Decimal
    balance_usd: Decimal | None
    rate: str | None
    goal_amount: Decimal | None
    earned_total: Decimal | None   # None si no se pudo leer el detalle del vault
    earned_month: Decimal | None
    earned_total_usd: Decimal | None
    earned_month_usd: Decimal | None


class SavingsSnapshot(BaseModel):
    taken_at: datetime
    balances: list[BalanceSnapshot]
    vaults: list[VaultSnapshot]
    total_liquid_usd: Decimal | None
    total_vaults_usd: Decimal | None
    # Monedas con saldo que no se pudieron pasar a USD (no suman a los totales)
    unconverted_currencies: list[str] = Field(default_factory=list)
    vaults_available: bool = True


class DeclaredProfile(BaseModel):
    kyc_status: str | None
    kyc_reason: str | None
    occupation: str | None
    country: str | None
    declared_annual_revenue: str | None     # bracket declarado
    declared_monthly_card_spend: str | None
    card_application_status: str | None
    compliance_flags: dict[str, bool | None]  # pep, obligatedSubject, usTaxResident


class IncomeAggregate(BaseModel):
    total_usd: Decimal
    distinct_sources: int
    top_payer_share: Decimal | None
    recurring_income_usd: Decimal


class ExpenseAggregate(BaseModel):
    total_usd: Decimal
    by_subcategory_usd: dict[str, Decimal]
    fees_taxes_usd: Decimal
    card_usd: Decimal


class MonthAggregate(BaseModel):
    month: str  # YYYY-MM
    income: IncomeAggregate
    expenses: ExpenseAggregate
    net_usd: Decimal
    stablecoin_swap_usd: Decimal
    dollarization_ratio: Decimal | None  # swaps hacia stablecoins / ingreso
    movements: int
    partial_movements: int


class SavingsAggregate(BaseModel):
    liquid_usd: Decimal | None
    vaults_usd: Decimal | None
    avg_monthly_expense_usd: Decimal | None
    runway_months: Decimal | None
    yield_total_usd: Decimal | None
    yield_month_usd: Decimal | None


class MonthlyAggregates(BaseModel):
    months: list[MonthAggregate]
    income_cv: Decimal | None  # coeficiente de variación del ingreso mensual
    savings: SavingsAggregate
    card_spend_coherence: Literal["true", "false", "unknown"]
    partial_pct: Decimal | None

"""Modelos del motor de scoring. Montos en Decimal (USD), nunca float."""

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class CreditFeatures(BaseModel):
    months_considered: list[str]      # meses completos usados (YYYY-MM)
    history_months: int               # meses con movimientos contados
    income_median_usd: Decimal
    recurring_income_avg_usd: Decimal  # promedio mensual de ingreso recurrente (últimos 3 meses)
    recurring_income_ratio: Decimal | None
    income_cv: Decimal | None
    net_margin: Decimal | None
    net_avg_usd: Decimal
    negative_months_share: Decimal | None
    runway_months: Decimal | None
    has_savings_goal: bool
    card_coherence: str
    partial_pct: Decimal
    pep: bool | None
    # v2: multi-source
    income_source_count: int = 0
    bill_payment_regularity: Decimal | None = None
    monotributo_status: str = "not_registered"
    platform_income_share: Decimal | None = None   # informativo, sin peso
    # Informativos, sin peso en v1
    top_payer_share: Decimal | None
    dollarization_ratio: Decimal | None


class Contribution(BaseModel):
    feature: str
    value: str | None
    points: int
    max_points: int


class ScoreResult(BaseModel):
    score: int
    band: str
    contributions: list[Contribution]
    reasons: list[str]   # códigos de las 3 mayores pérdidas de puntos
    reason_texts: list[str]


class LoanOffer(BaseModel):
    band: str
    currency: str = "USD"
    amount_max_usd: Decimal
    term_months: int
    max_term_months: int
    min_term_months: int
    tna: Decimal
    tea: Decimal
    cft: Decimal          # sin comisiones en v1: CFT = TEA
    installment_usd: Decimal
    max_installment_usd: Decimal
    total_payable_usd: Decimal
    valid_until: datetime
    disclaimer: str


class ScheduleRow(BaseModel):
    month: int
    installment_usd: Decimal
    interest_usd: Decimal
    principal_usd: Decimal
    balance_usd: Decimal


class LoanSimulation(BaseModel):
    amount_usd: Decimal
    term_months: int
    tna: Decimal
    tea: Decimal
    installment_usd: Decimal
    total_payable_usd: Decimal
    total_interest_usd: Decimal
    schedule: list[ScheduleRow]
    disclaimer: str


class CreditDecision(BaseModel):
    subject_id: str               # hash de la credencial, nunca la key
    decided_at: datetime
    scorecard_version: str
    eligible: bool
    rejection_reasons: list[str] = Field(default_factory=list)
    score: ScoreResult | None = None
    offer: LoanOffer | None = None
    no_offer_reason: str | None = None
    features: CreditFeatures
    sources: list[dict] = Field(default_factory=list)  # [{id, name, live}] usadas en la decisión

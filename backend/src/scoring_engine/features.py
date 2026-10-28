"""Features de crédito a partir de los agregados de belo_scoring. Lógica pura."""

from datetime import datetime
from decimal import Decimal
from statistics import median

from belo_scoring.models import DeclaredProfile, MonthlyAggregates, SavingsSnapshot

from .config import FEATURE_WINDOW_MONTHS
from .models import CreditFeatures

RATIO = Decimal("0.0001")
ZERO = Decimal(0)


def _ratio(num: Decimal, den: Decimal) -> Decimal | None:
    return (num / den).quantize(RATIO) if den else None


def _cv(values: list[Decimal]) -> Decimal | None:
    """Coeficiente de variación (desvío poblacional / media)."""
    if len(values) < 2:
        return None
    mean = sum(values, ZERO) / len(values)
    if not mean:
        return None
    variance = sum(((v - mean) ** 2 for v in values), ZERO) / len(values)
    return (variance.sqrt() / mean).quantize(RATIO)


def extract_features(
    monthly: MonthlyAggregates,
    savings: SavingsSnapshot,
    declared: DeclaredProfile,
    as_of: datetime,
) -> CreditFeatures:
    # Solo meses completos (el mes en curso bajaría la mediana y subiría el CV),
    # desde el primer mes con movimientos (antes la cuenta no existía o no se usaba)
    current = as_of.strftime("%Y-%m")
    months = [m for m in monthly.months if m.month < current][-FEATURE_WINDOW_MONTHS:]
    first_active = next((i for i, m in enumerate(months) if m.movements > 0), len(months))
    months = months[first_active:]
    active = [m for m in months if m.movements > 0]

    incomes = [m.income.total_usd for m in months]
    income_total = sum(incomes, ZERO)
    last3 = months[-3:]
    recurring_last3 = sum((m.income.recurring_income_usd for m in last3), ZERO)
    income_last3 = sum((m.income.total_usd for m in last3), ZERO)
    net_total = sum((m.net_usd for m in months), ZERO)

    expense_avg = sum((m.expenses.total_usd for m in months), ZERO) / len(months) if months else ZERO
    stock = [v for v in (savings.total_liquid_usd, savings.total_vaults_usd) if v is not None]
    runway = (sum(stock, ZERO) / expense_avg).quantize(Decimal("0.01")) if stock and expense_avg else None

    swaps = sum((m.stablecoin_swap_usd for m in months), ZERO)
    payer_shares = [m.income.top_payer_share for m in months if m.income.top_payer_share is not None]

    return CreditFeatures(
        months_considered=[m.month for m in months],
        history_months=len(active),
        income_median_usd=median(incomes) if incomes else ZERO,
        recurring_income_avg_usd=recurring_last3 / len(last3) if last3 else ZERO,
        recurring_income_ratio=_ratio(recurring_last3, income_last3),
        income_cv=_cv(incomes),
        net_margin=_ratio(net_total, income_total),
        net_avg_usd=net_total / len(months) if months else ZERO,
        negative_months_share=_ratio(Decimal(sum(1 for m in active if m.net_usd < 0)), Decimal(len(active))),
        runway_months=runway,
        has_savings_goal=any(v.goal_amount for v in savings.vaults),
        card_coherence=monthly.card_spend_coherence,
        partial_pct=monthly.partial_pct or ZERO,
        pep=declared.compliance_flags.get("pep"),
        top_payer_share=max(payer_shares) if payer_shares else None,
        dollarization_ratio=_ratio(swaps, income_total),
    )

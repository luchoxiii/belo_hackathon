"""Agregados mensuales en USD para el motor de scoring. Lógica pura, sin I/O."""

from collections import defaultdict
from decimal import Decimal

from .fx import USD_PEGGED, FxProvider, StubFxProvider, normalize_currency, to_usd
from .models import (
    CategorizedMovement,
    Category,
    DeclaredProfile,
    ExpenseAggregate,
    IncomeAggregate,
    MonthAggregate,
    MonthlyAggregates,
    SavingsAggregate,
    SavingsSnapshot,
)

RATIO = Decimal("0.0001")
RECURRING_WINDOW = 4   # últimos 4 meses, incluido el actual
RECURRING_MIN = 3      # depositó en al menos 3 de esos meses


def _month_key(m: CategorizedMovement) -> str:
    return m.occurred_at.strftime("%Y-%m")


def _shift(month: str, delta: int) -> str:
    year, mon = map(int, month.split("-"))
    index = year * 12 + (mon - 1) + delta
    return f"{index // 12:04d}-{index % 12 + 1:02d}"


def month_range(first: str, last: str) -> list[str]:
    months = [first]
    while months[-1] < last:
        months.append(_shift(months[-1], 1))
    return months


def _ratio(num: Decimal, den: Decimal) -> Decimal | None:
    return (num / den).quantize(RATIO) if den else None


def _into_stablecoin(m: CategorizedMovement) -> bool:
    """Un swap que termina en USDT/USDC (BUY de base stable o SELL hacia quote stable)."""
    if not m.swap_pair or "/" not in m.swap_pair:
        return False
    base, quote = (normalize_currency(c) for c in m.swap_pair.split("/", 1))
    if base in USD_PEGGED and quote in USD_PEGGED:
        return False
    if m.swap_direction == "BUY":
        return base in USD_PEGGED
    if m.swap_direction == "SELL":
        return quote in USD_PEGGED
    return False


def parse_bracket(bracket: str | None) -> tuple[Decimal, Decimal | None] | None:
    """`from_500_to_1000` -> (500, 1000); `more_than_10000` -> (10000, None)."""
    if not bracket:
        return None
    parts = bracket.split("_")
    try:
        if parts[0] == "from" and parts[2] == "to":
            return Decimal(parts[1]), Decimal(parts[3])
        if parts[:2] == ["more", "than"]:
            return Decimal(parts[2]), None
    except (IndexError, ArithmeticError):
        return None
    return None


def aggregate_monthly(
    movements: list[CategorizedMovement],
    savings: SavingsSnapshot,
    declared: DeclaredProfile | None = None,
    fx: FxProvider | None = None,
    months: list[str] | None = None,
) -> MonthlyAggregates:
    fx = fx or StubFxProvider()
    by_month: dict[str, list[CategorizedMovement]] = defaultdict(list)
    for m in movements:
        by_month[_month_key(m)].append(m)

    if months is None:
        months = month_range(min(by_month), max(by_month)) if by_month else []

    # Meses con ingreso por contraparte, para detectar recurrencia (señal de sueldo)
    income_months: dict[str, set[str]] = defaultdict(set)
    for m in movements:
        if m.category == Category.INCOME and m.counterparty_key and m.amount_usd is not None:
            income_months[m.counterparty_key].add(_month_key(m))

    result: list[MonthAggregate] = []
    for month in months:
        items = by_month.get(month, [])
        income = [m for m in items if m.category == Category.INCOME and m.amount_usd is not None]
        expenses = [m for m in items if m.category == Category.EXPENSE and m.amount_usd is not None]

        income_total = sum((m.amount_usd for m in income), Decimal(0))
        by_payer: dict[str, Decimal] = defaultdict(Decimal)
        for m in income:
            if m.counterparty_key:
                by_payer[m.counterparty_key] += m.amount_usd
        window = {_shift(month, -i) for i in range(RECURRING_WINDOW)}
        recurring = {k for k, ms in income_months.items() if len(ms & window) >= RECURRING_MIN}

        by_sub: dict[str, Decimal] = defaultdict(Decimal)
        fees_taxes = Decimal(0)
        for m in expenses:
            by_sub[m.subcategory] += m.amount_usd
            for value, currency in ((m.fee, m.fee_currency), (m.taxes, m.tax_currency)):
                converted = to_usd(value, currency, m.occurred_at, fx)
                if converted:
                    fees_taxes += converted
        expense_total = sum(by_sub.values(), Decimal(0))

        stable_swaps = sum(
            (m.amount_usd for m in items
             if m.subcategory == "conversion" and m.amount_usd is not None and _into_stablecoin(m)),
            Decimal(0),
        )

        result.append(MonthAggregate(
            month=month,
            income=IncomeAggregate(
                total_usd=income_total,
                distinct_sources=len(by_payer),
                top_payer_share=_ratio(max(by_payer.values()), income_total) if by_payer else None,
                recurring_income_usd=sum((v for k, v in by_payer.items() if k in recurring), Decimal(0)),
            ),
            expenses=ExpenseAggregate(
                total_usd=expense_total,
                by_subcategory_usd=dict(by_sub),
                fees_taxes_usd=fees_taxes,
                card_usd=by_sub.get("card", Decimal(0)),
            ),
            net_usd=income_total - expense_total,
            stablecoin_swap_usd=stable_swaps,
            dollarization_ratio=_ratio(stable_swaps, income_total),
            movements=len(items),
            partial_movements=sum(1 for m in items if m.data_quality == "partial"),
        ))

    # Coeficiente de variación del ingreso mensual
    incomes = [m.income.total_usd for m in result]
    income_cv = None
    if len(incomes) >= 2:
        mean = sum(incomes, Decimal(0)) / len(incomes)
        if mean:
            variance = sum(((x - mean) ** 2 for x in incomes), Decimal(0)) / len(incomes)
            income_cv = (variance.sqrt() / mean).quantize(RATIO)

    avg_expense = (
        sum((m.expenses.total_usd for m in result), Decimal(0)) / len(result) if result else None
    )
    stock = [v for v in (savings.total_liquid_usd, savings.total_vaults_usd) if v is not None]
    runway = (
        (sum(stock, Decimal(0)) / avg_expense).quantize(Decimal("0.01"))
        if stock and avg_expense else None
    )

    def yield_sum(attr: str) -> Decimal | None:
        values = [getattr(b, attr) for b in savings.balances] + [getattr(v, attr) for v in savings.vaults]
        known = [v for v in values if v is not None]
        return sum(known, Decimal(0)) if known else None

    return MonthlyAggregates(
        months=result,
        income_cv=income_cv,
        savings=SavingsAggregate(
            liquid_usd=savings.total_liquid_usd,
            vaults_usd=savings.total_vaults_usd,
            avg_monthly_expense_usd=avg_expense,
            runway_months=runway,
            yield_total_usd=yield_sum("earned_total_usd"),
            yield_month_usd=yield_sum("earned_month_usd"),
        ),
        card_spend_coherence=_card_coherence(result, declared),
        partial_pct=(
            (Decimal(sum(1 for m in movements if m.data_quality == "partial")) * 100 / len(movements)).quantize(Decimal("0.01"))
            if movements else None
        ),
    )


def _card_coherence(months: list[MonthAggregate], declared: DeclaredProfile | None) -> str:
    """¿El gasto mensual promedio con tarjeta cae en el bracket declarado?"""
    if declared is None or declared.card_application_status is None or not months:
        return "unknown"
    bracket = parse_bracket(declared.declared_monthly_card_spend)
    if bracket is None:
        return "unknown"
    avg = sum((m.expenses.card_usd for m in months), Decimal(0)) / len(months)
    low, high = bracket
    return "true" if avg >= low and (high is None or avg <= high) else "false"


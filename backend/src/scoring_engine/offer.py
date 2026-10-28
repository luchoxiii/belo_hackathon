"""Oferta preaprobada y simulación con sistema francés. Lógica pura, Decimal."""

from datetime import datetime, timedelta
from decimal import ROUND_DOWN, ROUND_HALF_UP, Decimal

from .config import (
    DISCLAIMER,
    INSTALLMENT_INCOME_SHARE,
    INSTALLMENT_NET_SHARE,
    MAX_LOAN_USD,
    MIN_LOAN_USD,
    MIN_TERM_MONTHS,
    NON_RECURRING_INCOME_HAIRCUT,
    OFFER_BY_BAND,
    OFFER_ROUNDING,
    OFFER_VALID_DAYS,
)
from .models import CreditFeatures, LoanOffer, LoanSimulation, ScheduleRow, ScoreResult

CENT = Decimal("0.01")
RATE = Decimal("0.0001")


class OfferError(ValueError):
    """Monto o plazo fuera de los límites de la oferta."""


def _money(value: Decimal) -> Decimal:
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


def monthly_rate(tna: Decimal) -> Decimal:
    return tna / 12


def tea(tna: Decimal) -> Decimal:
    return ((1 + monthly_rate(tna)) ** 12 - 1).quantize(RATE, rounding=ROUND_HALF_UP)


def installment(principal: Decimal, tna: Decimal, term: int) -> Decimal:
    """Cuota fija (sistema francés)."""
    i = monthly_rate(tna)
    if i == 0:
        return principal / term
    return principal * i / (1 - (1 + i) ** -term)


def present_value(payment: Decimal, tna: Decimal, term: int) -> Decimal:
    """Monto máximo que se repaga con `payment` por mes."""
    i = monthly_rate(tna)
    if i == 0:
        return payment * term
    return payment * (1 - (1 + i) ** -term) / i


def max_installment(features: CreditFeatures) -> Decimal:
    """Capacidad de pago: tope por ingreso y por neto mensual promedio."""
    income_base = (
        features.recurring_income_avg_usd
        if features.recurring_income_avg_usd > 0
        else features.income_median_usd * NON_RECURRING_INCOME_HAIRCUT
    )
    if features.net_avg_usd <= 0:
        return Decimal(0)
    return min(income_base * INSTALLMENT_INCOME_SHARE, features.net_avg_usd * INSTALLMENT_NET_SHARE)


def build_offer(
    features: CreditFeatures,
    scored: ScoreResult,
    now: datetime,
    term_months: int | None = None,
) -> tuple[LoanOffer | None, str | None]:
    """Devuelve (oferta, None) o (None, motivo)."""
    params = OFFER_BY_BAND.get(scored.band)
    if params is None:
        return None, "low_score"

    max_term = int(params["max_term"])
    term = max(MIN_TERM_MONTHS, min(term_months or max_term, max_term))
    tna = Decimal(params["tna"])
    cap_installment = max_installment(features)
    if cap_installment <= 0:
        return None, "no_payment_capacity"

    amount = min(
        Decimal(params["income_multiple"]) * features.income_median_usd,
        present_value(cap_installment, tna, term),
        MAX_LOAN_USD,
    )
    amount = (amount / OFFER_ROUNDING).to_integral_value(rounding=ROUND_DOWN) * OFFER_ROUNDING
    if amount < MIN_LOAN_USD:
        return None, "amount_below_minimum"

    payment = _money(installment(amount, tna, term))
    rate = tea(tna)
    return LoanOffer(
        band=scored.band,
        amount_max_usd=amount,
        term_months=term,
        max_term_months=max_term,
        min_term_months=MIN_TERM_MONTHS,
        tna=tna,
        tea=rate,
        cft=rate,
        installment_usd=payment,
        max_installment_usd=_money(cap_installment),
        total_payable_usd=_money(payment * term),
        valid_until=now + timedelta(days=OFFER_VALID_DAYS),
        disclaimer=DISCLAIMER,
    ), None


def simulate(offer: LoanOffer, amount_usd: Decimal, term_months: int) -> LoanSimulation:
    """Tabla de cuotas para un monto y plazo dentro de los límites de la oferta."""
    if amount_usd <= 0 or amount_usd > offer.amount_max_usd:
        raise OfferError(f"El monto debe estar entre 0 y {offer.amount_max_usd} USD")
    if not offer.min_term_months <= term_months <= offer.max_term_months:
        raise OfferError(f"El plazo debe estar entre {offer.min_term_months} y {offer.max_term_months} meses")
    payment = _money(installment(amount_usd, offer.tna, term_months))
    if payment > offer.max_installment_usd:
        raise OfferError(f"La cuota supera tu capacidad de pago ({offer.max_installment_usd} USD)")

    i = monthly_rate(offer.tna)
    balance = amount_usd
    schedule = []
    for month in range(1, term_months + 1):
        interest = _money(balance * i)
        # La última cuota absorbe el redondeo
        principal = balance if month == term_months else payment - interest
        balance = balance - principal
        schedule.append(ScheduleRow(
            month=month,
            installment_usd=_money(interest + principal),
            interest_usd=interest,
            principal_usd=_money(principal),
            balance_usd=_money(balance),
        ))
    total = sum((row.installment_usd for row in schedule), Decimal(0))
    return LoanSimulation(
        amount_usd=amount_usd,
        term_months=term_months,
        tna=offer.tna,
        tea=offer.tea,
        installment_usd=payment,
        total_payable_usd=total,
        total_interest_usd=total - amount_usd,
        schedule=schedule,
        disclaimer=offer.disclaimer,
    )

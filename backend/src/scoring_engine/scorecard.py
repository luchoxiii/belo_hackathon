"""Elegibilidad (gates duros) y scorecard por puntos. Lógica pura."""

from decimal import Decimal

from .config import (
    ADJUSTMENTS,
    BANDS,
    BASE_SCORE,
    MAX_PARTIAL_PCT,
    MIN_HISTORY_MONTHS,
    PARTIAL_PENALTY_FROM,
    REASON_TEXT,
    SCORECARD_BINS,
)
from .models import Contribution, CreditFeatures, ScoreResult


def check_eligibility(features: CreditFeatures) -> list[str]:
    """Códigos de rechazo; lista vacía = elegible. Cortan antes del score."""
    reasons = []
    if features.partial_pct > MAX_PARTIAL_PCT:
        reasons.append("insufficient_data")
    if features.history_months < MIN_HISTORY_MONTHS:
        reasons.append("short_history")
    if features.income_median_usd <= 0:
        reasons.append("no_income")
    if features.pep is True:
        reasons.append("manual_review")
    return reasons


def bin_points(value: Decimal | None, bins: list[tuple[Decimal | None, Decimal | None, int]]) -> int:
    """Puntos del bin [desde, hasta). Un valor faltante suma 0."""
    if value is None:
        return 0
    for low, high, points in bins:
        if (low is None or value >= low) and (high is None or value < high):
            return points
    return 0


def band_for(score: int) -> str:
    return next(band for threshold, band in BANDS if score >= threshold)


def score(features: CreditFeatures) -> ScoreResult:
    contributions = []
    for feature, bins in SCORECARD_BINS.items():
        value = getattr(features, feature)
        contributions.append(Contribution(
            feature=feature,
            value=None if value is None else str(value),
            points=bin_points(Decimal(value) if value is not None else None, bins),
            max_points=max(points for _, _, points in bins),
        ))

    goal = ADJUSTMENTS["has_savings_goal"]
    contributions.append(Contribution(
        feature="has_savings_goal", value=str(features.has_savings_goal),
        points=goal if features.has_savings_goal else 0, max_points=goal,
    ))
    contributions.append(Contribution(
        feature="card_coherence_false", value=features.card_coherence,
        points=ADJUSTMENTS["card_coherence_false"] if features.card_coherence == "false" else 0, max_points=0,
    ))
    mono = {"up_to_date": ADJUSTMENTS["monotributo_up_to_date"],
            "in_debt": ADJUSTMENTS["monotributo_in_debt"]}.get(features.monotributo_status, 0)
    contributions.append(Contribution(
        feature="monotributo", value=features.monotributo_status,
        points=mono, max_points=ADJUSTMENTS["monotributo_up_to_date"],
    ))
    contributions.append(Contribution(
        feature="partial_data", value=str(features.partial_pct),
        points=ADJUSTMENTS["partial_data"] if features.partial_pct > PARTIAL_PENALTY_FROM else 0, max_points=0,
    ))

    total = BASE_SCORE + sum(c.points for c in contributions)
    # Razones: las 3 mayores pérdidas de puntos respecto del máximo
    lost = sorted(
        (c for c in contributions if c.max_points - c.points > 0),
        key=lambda c: c.max_points - c.points,
        reverse=True,
    )[:3]
    return ScoreResult(
        score=total,
        band=band_for(total),
        contributions=contributions,
        reasons=[c.feature for c in lost],
        reason_texts=[REASON_TEXT[c.feature] for c in lost],
    )

"""Decisión de crédito auditable: pipeline completo desde RawData. Lógica pura salvo `save_decision`."""

import hashlib
import json
from pathlib import Path

from belo_scoring import (
    aggregate_monthly,
    build_declared_profile,
    build_savings_snapshot,
    categorize,
    fx_for_rates,
)
from belo_scoring.aggregate import month_range
from belo_scoring.models import RawData

from .config import SCORECARD_VERSION
from .features import extract_features
from .models import CreditDecision
from .offer import build_offer
from .scorecard import check_eligibility, score


def subject_id_for(api_key: str) -> str:
    """Identificador estable del titular sin guardar la credencial."""
    return hashlib.sha256(api_key.encode()).hexdigest()[:16]


def decide(raw: RawData, subject_id: str, term_months: int | None = None) -> CreditDecision:
    fx = fx_for_rates(raw.fx_rates)
    movements = categorize(raw, fx)
    savings = build_savings_snapshot(raw, fx)
    declared = build_declared_profile(raw)
    months = month_range(raw.window_from.strftime("%Y-%m"), raw.window_to.strftime("%Y-%m"))
    monthly = aggregate_monthly(movements, savings, declared, fx=fx, months=months)

    features = extract_features(monthly, savings, declared, as_of=raw.fetched_at)
    decision = CreditDecision(
        subject_id=subject_id,
        decided_at=raw.fetched_at,
        scorecard_version=SCORECARD_VERSION,
        eligible=False,
        features=features,
    )
    rejections = check_eligibility(features)
    if rejections:
        decision.rejection_reasons = rejections
        return decision

    decision.eligible = True
    decision.score = score(features)
    decision.offer, decision.no_offer_reason = build_offer(
        features, decision.score, now=raw.fetched_at, term_months=term_months,
    )
    return decision


def save_decision(decision: CreditDecision, directory: Path) -> Path:
    """Registro para calibrar la scorecard cuando haya datos de repago."""
    directory.mkdir(parents=True, exist_ok=True)
    stamp = decision.decided_at.strftime("%Y%m%dT%H%M%S")
    path = directory / f"{decision.subject_id}-{stamp}.json"
    path.write_text(json.dumps(decision.model_dump(mode="json"), indent=2, ensure_ascii=False))
    return path

"""
Score en JSON: la metodología (reglas, umbrales, puntos) y el resultado
de una decisión. Todo sale de `config.py`, así no se desactualiza.

Montos y ratios como strings decimales, igual que la API de belo.
"""

from decimal import Decimal
from typing import Any

from . import config
from .models import CreditDecision

# Nombre de la contribución en la scorecard -> feature que la explica
ADJUSTMENT_FEATURE = {
    "card_coherence_false": "card_coherence",
    "partial_data": "partial_pct",
    "has_savings_goal": "has_savings_goal",
}

PIPELINE = [
    ("collect", "belo_scoring.fetch_raw", "Lee la cuenta en belo (solo GET): movimientos, tarjetas, saldos, vaults y cotización ARS/USD."),
    ("categorize", "belo_scoring.categorize", "Clasifica cada movimiento con reglas fijas en orden: estado, swap, cuenta propia, depósito, egreso, tarjeta."),
    ("aggregate", "belo_scoring.aggregate_monthly", "Suma por mes en USD: ingresos, egresos, recurrencia, neto, dolarización."),
    ("features", "scoring_engine.extract_features", "Calcula ratios sobre los meses completos (sin el mes en curso)."),
    ("eligibility", "scoring_engine.check_eligibility", "Filtros duros: si alguno falla, no se calcula score."),
    ("score", "scoring_engine.score", "Suma puntos por tramo de cada feature más ajustes; asigna banda."),
    ("offer", "scoring_engine.build_offer", "Monto y cuota por banda, limitados por capacidad de pago (sistema francés)."),
]

GATES = [
    ("insufficient_data", f"partial_pct > {config.MAX_PARTIAL_PCT}", "Demasiados movimientos sin valorizar."),
    ("short_history", f"history_months < {config.MIN_HISTORY_MONTHS}", "Historial demasiado corto."),
    ("no_income", "income_median_usd <= 0", "Sin ingresos en los meses considerados."),
    ("manual_review", "pep == true", "Persona expuesta políticamente: requiere revisión manual (no resta puntos)."),
]


def _s(value: Any) -> str | None:
    return None if value is None else str(value)


def _bin_text(low: Decimal | None, high: Decimal | None) -> str:
    if low is None:
        return f"< {high}"
    if high is None:
        return f">= {low}"
    return f">= {low} y < {high}"


def _adjustment_condition(name: str) -> str:
    return {
        "has_savings_goal": "has_savings_goal == true",
        "card_coherence_false": 'card_coherence == "false"',
        "partial_data": f"{config.PARTIAL_PENALTY_FROM} < partial_pct <= {config.MAX_PARTIAL_PCT}",
    }[name]


def _max_score() -> int:
    bins = sum(max(p for _, _, p in b) for b in config.SCORECARD_BINS.values())
    bonus = sum(v for v in config.ADJUSTMENTS.values() if v > 0)
    return config.BASE_SCORE + bins + bonus


def methodology() -> dict[str, Any]:
    thresholds = [t for t, _ in config.BANDS]
    bands = []
    for i, (threshold, band) in enumerate(config.BANDS):
        upper = thresholds[i - 1] - 1 if i > 0 else _max_score()
        bands.append({"band": band, "min_score": threshold, "max_score": upper,
                      "has_offer": band in config.OFFER_BY_BAND})
    return {
        "scorecard_version": config.SCORECARD_VERSION,
        "deterministic": True,
        "llm_involved": False,
        "summary": ("Reglas fijas y versionadas: con los mismos datos el resultado es siempre el mismo. "
                    "Ningún LLM interviene en el cálculo; el agente MCP solo presenta el resultado. "
                    "Los umbrales son criterio experto (placeholders) hasta calibrar con datos de repago."),
        "data_window": {"max_months": config.FEATURE_WINDOW_MONTHS, "complete_months_only": True,
                        "currency": "USD"},
        "pipeline": [{"step": s, "function": f, "description": d} for s, f, d in PIPELINE],
        "eligibility_gates": [{"code": c, "rule": r, "description": d} for c, r, d in GATES],
        "score": {
            "base": config.BASE_SCORE,
            "max": _max_score(),
            "features": [
                {"feature": name, **config.FEATURE_INFO[name],
                 "bins": [{"rule": _bin_text(lo, hi), "from": _s(lo), "to": _s(hi), "points": pts}
                          for lo, hi, pts in bins]}
                for name, bins in config.SCORECARD_BINS.items()
            ],
            "adjustments": [
                {"feature": ADJUSTMENT_FEATURE[name], **config.FEATURE_INFO[ADJUSTMENT_FEATURE[name]],
                 "condition": _adjustment_condition(name), "points": pts}
                for name, pts in config.ADJUSTMENTS.items()
            ],
        },
        "bands": bands,
        "offer": {
            "currency": "USD",
            "amortization": "francés (cuota fija)",
            "by_band": {band: {"income_multiple": _s(p["income_multiple"]), "max_term_months": p["max_term"],
                               "tna": _s(p["tna"])}
                        for band, p in config.OFFER_BY_BAND.items()},
            "min_term_months": config.MIN_TERM_MONTHS,
            "max_installment_rule": (
                f"min({config.INSTALLMENT_INCOME_SHARE} × ingreso recurrente mensual "
                f"(o {config.NON_RECURRING_INCOME_HAIRCUT} × ingreso mediano si no hay recurrente), "
                f"{config.INSTALLMENT_NET_SHARE} × neto mensual promedio); 0 si el neto es <= 0"),
            "amount_rule": ("min(income_multiple × ingreso mediano, valor presente de la cuota máxima, "
                            f"{config.MAX_LOAN_USD}); redondeado hacia abajo a {config.OFFER_ROUNDING}"),
            "min_loan_usd": _s(config.MIN_LOAN_USD),
            "max_loan_usd": _s(config.MAX_LOAN_USD),
            "valid_days": config.OFFER_VALID_DAYS,
            "fees": "sin comisiones en v1: CFT = TEA",
            "disclaimer": config.DISCLAIMER,
        },
    }


def explain_decision(decision: CreditDecision, demo: bool = False) -> dict[str, Any]:
    """Resultado de una decisión. Sin subject_id, contrapartes ni datos de cuenta."""
    s = decision.score
    no_offer = decision.no_offer_reason
    return {
        "demo": demo,
        "scorecard_version": decision.scorecard_version,
        "decided_at": decision.decided_at.isoformat(),
        "eligible": decision.eligible,
        "rejections": [{"code": r, "message": config.REJECTION_TEXT.get(r, r)} for r in decision.rejection_reasons],
        "score": None if s is None else {"value": s.score, "band": s.band, "base": config.BASE_SCORE,
                                         "max": _max_score()},
        "reasons": [] if s is None else [{"feature": ADJUSTMENT_FEATURE.get(r, r), "message": t}
                                         for r, t in zip(s.reasons, s.reason_texts)],
        "offer": None if decision.offer is None else decision.offer.model_dump(mode="json"),
        "no_offer_reason": None if no_offer is None else {"code": no_offer,
                                                          "message": config.NO_OFFER_TEXT.get(no_offer, no_offer)},
    }

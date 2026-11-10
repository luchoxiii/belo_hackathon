"""
Motor de scoring crediticio y oferta preaprobada (simulada).

Lógica pura sobre los agregados de `belo_scoring`. No mueve fondos.
"""

from .decision import decide, save_decision, subject_id_for
from .features import extract_features
from .models import CreditDecision, CreditFeatures, LoanOffer, LoanSimulation, ScoreResult
from .offer import OfferError, build_offer, simulate
from .scorecard import check_eligibility, score

__all__ = [
    "CreditDecision",
    "CreditFeatures",
    "LoanOffer",
    "LoanSimulation",
    "OfferError",
    "ScoreResult",
    "build_offer",
    "check_eligibility",
    "decide",
    "extract_features",
    "save_decision",
    "score",
    "simulate",
    "subject_id_for",
]

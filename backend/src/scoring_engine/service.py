"""
Servicio de crédito para las tools MCP: credencial -> datos crudos (cacheados) -> decisión.

Sin dependencia de FastMCP. Las salidas `public_*` son lo único que llega al LLM:
nunca contrapartes, CVU, direcciones ni la credencial.
"""

import time
from collections.abc import Awaitable, Callable
from decimal import Decimal
from typing import Any

from belo_client import BeloClient
from belo_scoring import fetch_raw
from belo_scoring.models import RawData

from .config import NO_OFFER_TEXT, REJECTION_TEXT
from .decision import decide, subject_id_for
from .demo import demo_raw
from .models import CreditDecision, LoanOffer
from .offer import simulate

CACHE_TTL_SECONDS = 600
WINDOW_DAYS = 180

RawFetcher = Callable[[str], Awaitable[RawData]]

_cache: dict[str, tuple[float, RawData]] = {}


async def _fetch_for_key(api_key: str) -> RawData:
    async with BeloClient(api_key=api_key) as client:
        return await fetch_raw(WINDOW_DAYS, client=client)


async def get_decision(
    api_key: str,
    term_months: int | None = None,
    fetcher: RawFetcher = _fetch_for_key,
) -> CreditDecision:
    """Cachea los datos crudos por titular (vaults va a 1 req/s y Vercel corta a los 30 s)."""
    subject_id = subject_id_for(api_key)
    cached = _cache.get(subject_id)
    if cached and time.monotonic() - cached[0] < CACHE_TTL_SECONDS:
        raw = cached[1]
    else:
        raw = await fetcher(api_key)
        _cache[subject_id] = (time.monotonic(), raw)
    return decide(raw, subject_id, term_months=term_months)


def demo_decision(profile: str, term_months: int | None = None) -> CreditDecision:
    """Decisión sobre un perfil sintético, sin credencial ni llamadas a belo."""
    return decide(demo_raw(profile), f"demo-{profile}", term_months=term_months)


def clear_cache() -> None:
    _cache.clear()


def _is_demo(decision: CreditDecision) -> bool:
    return decision.subject_id.startswith("demo-")


def public_profile(decision: CreditDecision) -> dict[str, Any]:
    result: dict[str, Any] = {
        "demo": _is_demo(decision),
        "eligible": decision.eligible,
        "scorecard_version": decision.scorecard_version,
        "evaluated_months": decision.features.months_considered,
    }
    if not decision.eligible:
        result["reasons"] = [REJECTION_TEXT.get(r, r) for r in decision.rejection_reasons]
        return result
    result.update(
        score=decision.score.score,
        band=decision.score.band,
        reasons=decision.score.reason_texts,
        has_preapproved_offer=decision.offer is not None,
    )
    return result


def _offer_dict(offer: LoanOffer) -> dict[str, Any]:
    return offer.model_dump(mode="json")


def public_offer(decision: CreditDecision) -> dict[str, Any]:
    result = _public_offer(decision)
    # Que el agente no presente un perfil sintético como real
    result["demo"] = _is_demo(decision)
    return result


def _public_offer(decision: CreditDecision) -> dict[str, Any]:
    if not decision.eligible:
        return {
            "has_offer": False,
            "reasons": [REJECTION_TEXT.get(r, r) for r in decision.rejection_reasons],
        }
    if decision.offer is None:
        return {
            "has_offer": False,
            "reasons": [NO_OFFER_TEXT.get(decision.no_offer_reason, decision.no_offer_reason)],
        }
    return {"has_offer": True, "offer": _offer_dict(decision.offer)}


def public_simulation(decision: CreditDecision, amount_usd: Decimal, term_months: int) -> dict[str, Any]:
    """Lanza OfferError si el monto o el plazo están fuera de la oferta."""
    offer_info = public_offer(decision)
    if not offer_info["has_offer"]:
        return offer_info
    return {
        "has_offer": True,
        "demo": _is_demo(decision),
        "simulation": simulate(decision.offer, amount_usd, term_months).model_dump(mode="json"),
    }

import json
from datetime import datetime, timezone
from decimal import Decimal

import pytest

from belo_scoring.fx import TableFxProvider
from scoring_engine import OfferError, check_eligibility, decide, simulate
from scoring_engine.offer import installment, max_installment, present_value, tea
from scoring_engine.scorecard import band_for, bin_points
from scoring_engine.config import SCORECARD_BINS
from scoring_engine.service import clear_cache, demo_decision, get_decision, public_offer, public_profile

from profiles import erratic, salaried, short_history
from conftest import counterparty, raw_data, receipt, tx

D = Decimal


# Pipeline completo con perfiles sintéticos

def test_salaried_profile_gets_band_a_offer():
    decision = decide(salaried(), "test")
    f = decision.features
    assert f.months_considered == ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]
    assert f.income_median_usd == D("2000")
    assert f.recurring_income_ratio == D("1.0000")
    assert f.net_margin == D("0.5000")
    assert f.has_savings_goal

    assert decision.eligible
    assert decision.score.score == 770
    assert decision.score.band == "A"
    offer = decision.offer
    # Tope por LOAN_MAX_USD (2000) antes que por capacidad (PV de USD 500/mes)
    assert offer.amount_max_usd == D("2000")
    assert offer.term_months == 12
    assert offer.installment_usd == D("183.36")   # 2000 al 1,5% mensual, 12 cuotas
    assert offer.max_installment_usd == D("500.00")


def test_erratic_profile_scores_low_without_offer():
    decision = decide(erratic(), "test")
    assert decision.eligible
    assert decision.score.band in {"C", "D"}
    assert "recurring_income_ratio" in decision.score.reasons
    assert decision.offer is None
    assert decision.no_offer_reason in {"low_score", "no_payment_capacity"}


def test_short_history_is_rejected_before_scoring():
    decision = decide(short_history(), "test")
    assert not decision.eligible
    assert decision.rejection_reasons == ["short_history"]
    assert decision.score is None and decision.offer is None


def test_ars_income_needs_fx_or_is_insufficient_data():
    txs = [tx("deposit", amount="2900000", currency="ARGt", created_at=f"2026-{m}-05T12:00:00Z",
              receipt_=receipt(counterparty=counterparty("CVU", "empleador")))
           for m in ("05", "06", "07", "08", "09")]
    assert decide(raw_data(transactions=txs), "t").rejection_reasons == ["insufficient_data", "no_income"]

    rates = {"ARS": {f"2026-{m}-05": "1450" for m in ("05", "06", "07", "08", "09")}}
    decision = decide(raw_data(transactions=txs, fx_rates=rates), "t")
    assert decision.features.income_median_usd == D("2000")
    assert decision.eligible


def test_term_request_is_clamped_to_band():
    assert decide(salaried(), "t", term_months=6).offer.term_months == 6
    assert decide(salaried(), "t", term_months=48).offer.term_months == 12
    assert decide(salaried(), "t", term_months=1).offer.term_months == 3


# Piezas

def test_bins_are_half_open():
    bins = SCORECARD_BINS["runway_months"]
    assert bin_points(D("0.99"), bins) == 0
    assert bin_points(D(1), bins) == 40
    assert bin_points(D(6), bins) == 110
    assert bin_points(None, bins) == 0


def test_bands():
    assert [band_for(s) for s in (720, 719, 640, 560, 559)] == ["A", "B", "B", "C", "D"]


def test_eligibility_gates():
    f = decide(salaried(), "t").features
    assert check_eligibility(f) == []
    assert check_eligibility(f.model_copy(update={"partial_pct": D(31)})) == ["insufficient_data"]
    assert check_eligibility(f.model_copy(update={"pep": True})) == ["manual_review"]
    assert check_eligibility(f.model_copy(update={"income_median_usd": D(0)})) == ["no_income"]


def test_french_amortization_known_values():
    assert installment(D(1000), D("0.12"), 12).quantize(D("0.01")) == D("88.85")
    assert present_value(D("88.85"), D("0.12"), 12).quantize(D(1)) == D(1000)
    assert tea(D("0.12")) == D("0.1268")


def test_capacity_limited_by_net_flow():
    f = decide(salaried(), "t").features
    assert max_installment(f.model_copy(update={"net_avg_usd": D(100)})) == D(50)
    assert max_installment(f.model_copy(update={"net_avg_usd": D(-1)})) == D(0)


def test_simulation_schedule_and_limits():
    offer = decide(salaried(), "t").offer
    sim = simulate(offer, D("1000"), 6)
    assert len(sim.schedule) == 6
    assert sim.schedule[-1].balance_usd == D("0.00")
    assert sum(r.principal_usd for r in sim.schedule) == D("1000.00")
    with pytest.raises(OfferError):
        simulate(offer, D("2500"), 6)
    with pytest.raises(OfferError):
        simulate(offer, D("1000"), 24)


def test_table_fx_uses_previous_business_day():
    fx = TableFxProvider({"ARGt": {"2026-10-23": "1500"}})
    assert fx.get_rate("ARS", datetime(2026, 10, 25, tzinfo=timezone.utc)) == D("1500")  # domingo
    assert fx.get_rate("ARS", datetime(2026, 11, 5, tzinfo=timezone.utc)) is None


# Salidas hacia el LLM

def test_public_outputs_have_no_sensitive_data():
    decision = decide(salaried(), "t")
    dumped = json.dumps([public_profile(decision), public_offer(decision)])
    for forbidden in ("empleador", "alquiler", "counterparty", "subject_id"):
        assert forbidden not in dumped
    assert public_offer(decision)["has_offer"] is True


def test_public_offer_explains_rejection():
    out = public_offer(decide(short_history(), "t"))
    assert out == {"has_offer": False, "demo": False,
                   "reasons": ["Necesitamos al menos 3 meses de movimientos en tu cuenta"]}


def test_demo_profiles_relative_to_today():
    # Sin fecha fija: los meses se arman hacia atrás desde hoy
    assert demo_decision("salaried").offer is not None
    assert demo_decision("erratic").offer is None
    assert demo_decision("short_history").rejection_reasons == ["short_history"]
    assert public_offer(demo_decision("salaried"))["demo"] is True
    with pytest.raises(ValueError):
        demo_decision("nope")


def test_demo_months_cross_year_boundary():
    from scoring_engine.demo import _months_before
    assert _months_before(datetime(2027, 2, 10, tzinfo=timezone.utc), 3) == ["2026-11", "2026-12", "2027-01"]


async def test_service_caches_raw_per_credential():
    clear_cache()
    calls = []

    async def fetcher(api_key):
        calls.append(api_key)
        return salaried()

    await get_decision("belo_live_a", fetcher=fetcher)
    await get_decision("belo_live_a", term_months=6, fetcher=fetcher)
    await get_decision("belo_live_b", fetcher=fetcher)
    assert calls == ["belo_live_a", "belo_live_b"]
    clear_cache()

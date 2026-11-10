from decimal import Decimal

from belo_scoring.aggregate import aggregate_monthly, parse_bracket
from belo_scoring.categorize import categorize
from belo_scoring.snapshot import build_declared_profile, build_savings_snapshot

from conftest import counterparty, raw_data, receipt, tx


def deposit(month: str, amount: str, payer: str):
    return tx("deposit", amount=amount, created_at=f"2026-{month}-05T12:00:00.000Z",
              receipt_=receipt(counterparty=counterparty("CVU", payer)))


def transfer(month: str, amount: str):
    return tx("transfer", amount=amount, created_at=f"2026-{month}-20T12:00:00.000Z",
              receipt_=receipt(counterparty=counterparty("ALIAS", "alquiler"),
                               debits=[{"currency": "USDT", "amount": amount}],
                               fee="1.00", feeCurrency="USDT"))


def build(raw):
    movements = categorize(raw)
    savings = build_savings_snapshot(raw)
    return aggregate_monthly(movements, savings, build_declared_profile(raw))


def test_monthly_income_expense_and_net():
    raw = raw_data(transactions=[deposit("09", "1000", "empleador"), deposit("09", "200", "cliente"),
                                 transfer("09", "300")])
    [month] = build(raw).months
    assert month.month == "2026-09"
    assert month.income.total_usd == Decimal("1200")
    assert month.income.distinct_sources == 2
    assert month.income.top_payer_share == Decimal("0.8333")
    assert month.expenses.total_usd == Decimal("300")
    assert month.expenses.by_subcategory_usd == {"bank_transfer": Decimal("300")}
    assert month.expenses.fees_taxes_usd == Decimal("1.00")
    assert month.net_usd == Decimal("900")


def test_recurring_income_needs_3_of_last_4_months():
    txs = [deposit(m, "1000", "empleador") for m in ("06", "07", "08")] + [deposit("08", "50", "esporadico")]
    by_month = {m.month: m for m in build(raw_data(transactions=txs)).months}
    assert by_month["2026-06"].income.recurring_income_usd == Decimal(0)
    assert by_month["2026-07"].income.recurring_income_usd == Decimal(0)
    assert by_month["2026-08"].income.recurring_income_usd == Decimal("1000")


def test_months_without_movements_are_included_and_cv():
    txs = [deposit("06", "1000", "a"), deposit("08", "1000", "a")]
    result = build(raw_data(transactions=txs))
    assert [m.month for m in result.months] == ["2026-06", "2026-07", "2026-08"]
    assert result.income_cv == Decimal("0.7071")


def test_internal_and_excluded_do_not_count():
    txs = [deposit("09", "1000", "a"),
           tx("deposit", amount="500", status="pending", created_at="2026-09-01T00:00:00Z"),
           tx("swap", amount="100", currency="USDT", created_at="2026-09-02T00:00:00Z",
              receipt_=receipt(conversion={"pairCode": "USDT/ARGt", "type": "BUY", "price": "1450",
                                           "baseAmount": "100", "quoteAmount": "145000"}))]
    [month] = build(raw_data(transactions=txs)).months
    assert month.income.total_usd == Decimal("1000")
    assert month.expenses.total_usd == Decimal(0)
    assert month.stablecoin_swap_usd == Decimal("100")
    assert month.dollarization_ratio == Decimal("0.1000")


def test_savings_runway_and_yield():
    raw = raw_data(
        transactions=[transfer("09", "500")],
        balances=[{"currencyCode": "USDT", "name": "Tether", "type": "stablecoin", "decimals": 6,
                   "available": "1500.00", "earned": {"total": "14.75", "today": "0.05", "month": "2.00"},
                   "yield": {"rate": "4.50%"}},
                  {"currencyCode": "ARGt", "name": "Peso", "type": "fiat_token", "decimals": 2,
                   "available": "100000.00", "earned": {"total": "0", "today": "0", "month": "0"}}],
        vaults=[{"id": "1295", "currencyCode": "USDC", "balance": "500.00", "isYieldActive": True,
                 "rate": "5.00%", "details": {"name": "Viaje", "goalAmount": "1000"}}],
        vault_details={"1295": {"id": "1295", "currencyCode": "USDC", "balance": "500.00",
                                "isYieldActive": True, "rate": "5.00%",
                                "details": {"name": "Viaje", "goalAmount": "1000"},
                                "earned": {"total": "3.00", "today": "0", "yesterday": "0",
                                           "week": "0", "month": "1.00", "year": "3.00"}}},
    )
    savings = build_savings_snapshot(raw)
    assert savings.total_liquid_usd == Decimal("1500.00")
    assert savings.total_vaults_usd == Decimal("500.00")
    assert savings.unconverted_currencies == ["ARS"]
    assert savings.vaults[0].goal_amount == Decimal("1000")

    result = build(raw)
    assert result.savings.runway_months == Decimal("4.00")  # 2000 / 500
    assert result.savings.yield_total_usd == Decimal("17.75")


def test_card_coherence():
    card = {"id": "c1", "status": "success", "amount": "700", "currency": "USD",
            "description": "X", "createdAt": "2026-09-10T00:00:00Z"}
    base = dict(card_transactions={"1": [card]}, card_application={"status": "approved", "acceptedTerms": True})
    assert build(raw_data(**base, declared_brackets={"monthly_card_spend": "from_500_to_1000"})).card_spend_coherence == "true"
    assert build(raw_data(**base, declared_brackets={"monthly_card_spend": "from_0_to_500"})).card_spend_coherence == "false"
    assert build(raw_data(**base)).card_spend_coherence == "unknown"
    # Tarjetas no habilitadas: no se puede evaluar
    assert build(raw_data(card_transactions={"1": [card]},
                          declared_brackets={"monthly_card_spend": "from_500_to_1000"})).card_spend_coherence == "unknown"


def test_parse_bracket():
    assert parse_bracket("from_500_to_1000") == (Decimal(500), Decimal(1000))
    assert parse_bracket("more_than_10000") == (Decimal(10000), None)
    assert parse_bracket("garbage") is None


def test_partial_pct():
    txs = [deposit("09", "100", "a"), tx("transfer", receipt_=None, created_at="2026-09-02T00:00:00Z")]
    assert build(raw_data(transactions=txs)).partial_pct == Decimal("50.00")


def test_declared_profile_has_no_civil_status():
    profile = build_declared_profile(raw_data())
    assert "civil_status" not in profile.model_dump()
    assert profile.kyc_status is None

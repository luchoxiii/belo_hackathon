from datetime import datetime
from decimal import Decimal

from belo_scoring.categorize import categorize
from belo_scoring.models import Category

from conftest import SELF_CVU, SELF_WALLET, counterparty, raw_data, receipt, self_contact, tx


class FixedFx:
    def __init__(self, rates: dict[str, str]):
        self.rates = {k: Decimal(v) for k, v in rates.items()}

    def get_rate(self, currency: str, at: datetime) -> Decimal | None:
        return self.rates.get(currency)


def one(transaction, contacts=None, fx=None):
    [movement] = categorize(raw_data(transactions=[transaction], contacts=contacts or []), fx)
    return movement


# Regla 1: status

def test_pending_is_excluded():
    m = one(tx("deposit", status="pending", receipt_=receipt(counterparty=counterparty("CVU", "123"))))
    assert (m.category, m.subcategory) == (Category.EXCLUDED, "pending")


def test_failed_is_excluded_even_if_swap():
    m = one(tx("swap", status="failed"))
    assert (m.category, m.subcategory) == (Category.EXCLUDED, "failed")


# Regla 2: swap

def test_swap_is_internal_conversion_with_pair_and_direction():
    conversion = {"pairCode": "USDT/ARGt", "type": "BUY", "price": "1250.00",
                  "baseAmount": "100.00", "quoteAmount": "125000.00"}
    m = one(tx("swap", amount="125000.00", currency="ARGt",
               receipt_=receipt(conversion=conversion,
                                debits=[{"currency": "ARGt", "amount": "125000.00"}])))
    assert (m.category, m.subcategory) == (Category.INTERNAL, "conversion")
    assert (m.swap_pair, m.swap_direction) == ("USDT/ARGt", "BUY")
    assert m.amount_usd == Decimal("100")  # usa el precio de la conversión
    assert m.data_quality == "full"


# Regla 3: cuenta propia

def test_transfer_to_own_cvu_is_self_transfer():
    m = one(tx("transfer", receipt_=receipt(counterparty=counterparty("CVU", SELF_CVU))),
            contacts=[self_contact()])
    assert (m.category, m.subcategory) == (Category.INTERNAL, "self_transfer")


def test_deposit_from_own_belotag_is_self_transfer():
    m = one(tx("deposit", receipt_=receipt(counterparty=counterparty("BELOTAG", belotag="Yo.Mismo"))),
            contacts=[self_contact()])
    assert (m.category, m.subcategory) == (Category.INTERNAL, "self_transfer")


def test_withdrawal_to_own_wallet_is_self_transfer():
    m = one(tx("withdrawal", receipt_=receipt(counterparty=counterparty("ETHEREUM", SELF_WALLET),
                                              network="ETHEREUM")),
            contacts=[self_contact()])
    assert m.category == Category.INTERNAL


def test_non_self_contact_is_not_internal():
    contact = {**self_contact(), "tier": "favorite"}
    m = one(tx("transfer", receipt_=receipt(counterparty=counterparty("CVU", SELF_CVU))),
            contacts=[contact])
    assert m.category == Category.EXPENSE


# Regla 4: ingresos

def test_deposit_rails():
    cases = {
        "CVU": "bank_transfer", "CBU": "bank_transfer", "ALIAS": "bank_transfer",
        "BELOTAG": "p2p_belo", "USER": "p2p_belo", "EMAIL": "p2p_belo",
        "TRON": "crypto_deposit", "QR": "other",
    }
    for account_type, expected in cases.items():
        m = one(tx("deposit", receipt_=receipt(counterparty=counterparty(account_type, "x"))))
        assert (m.category, m.subcategory) == (Category.INCOME, expected), account_type


def test_onchain_deposit_without_counterparty_is_crypto_deposit():
    m = one(tx("deposit", receipt_=receipt(counterparty=None, network="TRON", transactionHash="0x5c50")))
    assert (m.category, m.subcategory) == (Category.INCOME, "crypto_deposit")
    assert m.counterparty_key is None


def test_deposit_counterparty_key_for_recurrence():
    m = one(tx("deposit", receipt_=receipt(counterparty=counterparty("ALIAS", "proveedor.pagos"))))
    assert m.counterparty_key == "proveedor.pagos"


# Regla 5: egresos

def test_expense_rails():
    cases = {"CVU": "bank_transfer", "BELOTAG": "p2p_belo", "ARBITRUM_ONE": "crypto_withdrawal"}
    for account_type, expected in cases.items():
        m = one(tx("transfer", receipt_=receipt(counterparty=counterparty(account_type, "x"))))
        assert (m.category, m.subcategory) == (Category.EXPENSE, expected), account_type


def test_pix_payout_is_pix():
    m = one(tx("pix_payout", receipt_=receipt(counterparty=counterparty("PIX", "key"))))
    assert (m.category, m.subcategory) == (Category.EXPENSE, "pix")


def test_expense_amount_is_sum_of_debits_with_fee_as_breakdown():
    r = receipt(counterparty=counterparty("TRON", "T9yD"), network="TRON",
                debits=[{"currency": "USDT", "amount": "101.00"}],
                netAmount="100.00", netCurrency="USDT", fee="1.00", feeCurrency="USDT")
    m = one(tx("withdrawal", amount="100.00", receipt_=r))
    assert m.amount == Decimal("101.00")   # fee incluido, no se cuenta aparte
    assert m.amount_usd == Decimal("101.00")
    assert m.fee == Decimal("1.00")


def test_multi_currency_debits():
    r = receipt(counterparty=counterparty("CVU", "x"),
                debits=[{"currency": "USDT", "amount": "10.00"}, {"currency": "ARGt", "amount": "14500.00"}],
                taxes="150.00", taxCurrency="ARS")
    m = one(tx("transfer", amount="24500.00", currency="ARGt", receipt_=r), fx=FixedFx({"ARS": "1450"}))
    assert m.debits == {"USDT": Decimal("10.00"), "ARGt": Decimal("14500.00")}
    assert m.amount_usd == Decimal("20")   # 10 USDT + 14500 ARS / 1450
    assert m.amount == Decimal("24500.00")  # multi-moneda: queda el monto original
    assert m.taxes == Decimal("150.00")


def test_multi_currency_debits_without_fx_is_partial():
    r = receipt(counterparty=counterparty("CVU", "x"),
                debits=[{"currency": "USDT", "amount": "10.00"}, {"currency": "ARGt", "amount": "14500.00"}])
    m = one(tx("transfer", amount="24500.00", currency="ARGt", receipt_=r))
    assert m.amount_usd is None
    assert m.data_quality == "partial"


# Receipt null y FX

def test_null_receipt_keeps_movement_as_partial():
    m = one(tx("transfer", receipt_=None, metadata={"addressType": "ETHEREUM", "address": "0xabc"}))
    assert (m.category, m.subcategory) == (Category.EXPENSE, "crypto_withdrawal")
    assert m.data_quality == "partial"


def test_ars_without_fx_is_partial():
    m = one(tx("deposit", amount="25000.00", currency="ARGt",
               receipt_=receipt(counterparty=counterparty("CVU", "x"))))
    assert m.amount_usd is None
    assert m.data_quality == "partial"


def test_argt_uses_ars_rate():
    m = one(tx("deposit", amount="14500.00", currency="ARGt",
               receipt_=receipt(counterparty=counterparty("CVU", "x"))),
            fx=FixedFx({"ARS": "1450"}))
    assert m.amount_usd == Decimal("10")


# Regla 6: tarjetas

def card_tx(status="success", amount="25.90"):
    return {"id": f"card-{status}", "status": status, "amount": amount, "currency": "USD",
            "description": "GOOGLE *ADS", "createdAt": "2026-09-10T10:00:00.000Z"}


def test_card_movement_is_expense_card_with_description():
    [m] = categorize(raw_data(card_transactions={"296": [card_tx()]}))
    assert (m.source, m.category, m.subcategory) == ("card", Category.EXPENSE, "card")
    assert m.description == "GOOGLE *ADS"
    assert m.amount_usd == Decimal("25.90")


def test_pending_card_authorization_is_excluded():
    [m] = categorize(raw_data(card_transactions={"296": [card_tx(status="pending")]}))
    assert (m.category, m.subcategory) == (Category.EXCLUDED, "pending")


def test_no_float_anywhere():
    m = one(tx("deposit", amount="0.1", receipt_=receipt(counterparty=counterparty("CVU", "x"))))
    assert isinstance(m.amount, Decimal) and isinstance(m.amount_usd, Decimal)
    assert str(m.amount_usd) == "0.1"

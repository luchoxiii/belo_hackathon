"""
Clasificación de movimientos. Lógica pura, sin I/O.

Reglas en orden; gana la primera que aplica:
1. status != success      -> EXCLUDED / pending|failed
2. swap                   -> INTERNAL / conversion
3. contraparte propia     -> INTERNAL / self_transfer
4. deposit                -> INCOME / rail
5. transfer|withdrawal|pix_payout -> EXPENSE / rail
6. tarjeta                -> EXPENSE / card
(7. rendimientos -> INCOME / yield, como agregado en savings, no acá)
"""

from datetime import datetime
from decimal import Decimal
from typing import Any

from .fx import FxProvider, fx_for_rates, to_decimal, to_usd
from .models import Category, CategorizedMovement, RawData

BANK_RAILS = {"CVU", "CBU", "ALIAS"}
P2P_RAILS = {"BELOTAG", "USER", "EMAIL"}
PIX_RAILS = {"PIX"}
ONCHAIN_RAILS = {
    "BITCOIN", "BITCOIN_LIGHTNING", "ETHEREUM", "TRON", "POLYGON", "OPTIMISM",
    "ARBITRUM_ONE", "BSC", "SOLANA", "PLASMA", "BASE", "STELLAR", "AVALANCHE",
}
EXPENSE_TYPES = {"transfer", "withdrawal", "pix_payout"}


def parse_datetime(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _norm_key(value: str | None) -> str | None:
    return value.strip().lower() if value else None


def self_accounts(contacts: list[dict[str, Any]]) -> set[str]:
    """Direcciones y belotags de los contactos `tier == "self"` (cuentas propias)."""
    keys: set[str] = set()
    for contact in contacts:
        if contact.get("tier") != "self":
            continue
        if contact.get("belotag"):
            keys.add(_norm_key(contact["belotag"]))
        for account in contact.get("accounts") or []:
            for address in account.get("addresses") or []:
                if address.get("address"):
                    keys.add(_norm_key(address["address"]))
    return keys


def _rail(tx: dict[str, Any]) -> str | None:
    receipt = tx.get("receipt") or {}
    counterparty = receipt.get("counterparty") or {}
    metadata = tx.get("metadata") or {}
    return counterparty.get("accountType") or receipt.get("network") or metadata.get("addressType")


def _income_subcategory(tx: dict[str, Any]) -> str:
    receipt = tx.get("receipt")
    if receipt is None:
        return "other"
    rail = _rail(tx)
    if rail in BANK_RAILS:
        return "bank_transfer"
    if rail in P2P_RAILS:
        return "p2p_belo"
    if rail in ONCHAIN_RAILS or receipt.get("counterparty") is None:
        return "crypto_deposit"
    return "other"


def _expense_subcategory(tx: dict[str, Any]) -> str:
    if tx["type"] == "pix_payout":
        return "pix"
    rail = _rail(tx)
    if rail in BANK_RAILS:
        return "bank_transfer"
    if rail in P2P_RAILS:
        return "p2p_belo"
    if rail in ONCHAIN_RAILS:
        return "crypto_withdrawal"
    if rail in PIX_RAILS:
        return "pix"
    return "other"


def _debits(receipt: dict[str, Any] | None) -> dict[str, Decimal]:
    totals: dict[str, Decimal] = {}
    for debit in (receipt or {}).get("debits") or []:
        amount = to_decimal(debit.get("amount"))
        if amount is not None and debit.get("currency"):
            totals[debit["currency"]] = totals.get(debit["currency"], Decimal(0)) + amount
    return totals


def _is_self(tx: dict[str, Any], own: set[str]) -> bool:
    counterparty = (tx.get("receipt") or {}).get("counterparty") or {}
    candidates = {_norm_key(counterparty.get("account")), _norm_key(counterparty.get("belotag"))}
    candidates.discard(None)
    return bool(candidates & own)


def categorize_transaction(tx: dict[str, Any], own: set[str], fx: FxProvider) -> CategorizedMovement:
    receipt = tx.get("receipt")
    counterparty = (receipt or {}).get("counterparty") or {}
    conversion = (receipt or {}).get("conversion")
    occurred_at = parse_datetime(tx["createdAt"])
    status = tx.get("status")

    # Monto: en egresos, la suma de `debits` (ya incluye fee y taxes)
    debits = _debits(receipt)
    amount = to_decimal(tx.get("amount"))
    currency = tx.get("currency")
    amount_usd: Decimal | None = None
    is_expense = tx["type"] in EXPENSE_TYPES

    if is_expense and debits:
        if len(debits) == 1:
            currency, amount = next(iter(debits.items()))
        converted = [to_usd(a, c, occurred_at, fx, conversion) for c, a in debits.items()]
        amount_usd = None if any(v is None for v in converted) else sum(converted, Decimal(0))
    else:
        if amount is None and receipt is not None:
            amount = to_decimal(receipt.get("netAmount"))
            currency = receipt.get("netCurrency")
        amount_usd = to_usd(amount, currency, occurred_at, fx, conversion)

    base = dict(
        id=tx["id"],
        source="ledger",
        occurred_at=occurred_at,
        amount=amount if amount is not None else Decimal(0),
        currency=currency or "",
        amount_usd=amount_usd,
        fee=to_decimal((receipt or {}).get("fee")),
        fee_currency=(receipt or {}).get("feeCurrency"),
        taxes=to_decimal((receipt or {}).get("taxes")),
        tax_currency=(receipt or {}).get("taxCurrency"),
        debits=debits,
        counterparty_name=counterparty.get("name"),
        counterparty_key=counterparty.get("account") or counterparty.get("belotag"),
        raw_type=tx["type"],
        data_quality="partial" if receipt is None or amount_usd is None else "full",
    )

    # 1. pending / failed: se guardan aparte, no suman
    if status != "success":
        return CategorizedMovement(**base, category=Category.EXCLUDED, subcategory=status or "unknown")
    # Sin monto no hay nada que contar
    if amount is None:
        return CategorizedMovement(**base, category=Category.EXCLUDED, subcategory="no_data")
    # 2. swap
    if tx["type"] == "swap":
        metadata = tx.get("metadata") or {}
        return CategorizedMovement(
            **base,
            category=Category.INTERNAL,
            subcategory="conversion",
            swap_pair=(conversion or {}).get("pairCode") or metadata.get("pairCode"),
            swap_direction=(conversion or {}).get("type") or metadata.get("type"),
        )
    # 3. cuenta propia
    if _is_self(tx, own):
        return CategorizedMovement(**base, category=Category.INTERNAL, subcategory="self_transfer")
    # 4. ingreso
    if tx["type"] == "deposit":
        return CategorizedMovement(**base, category=Category.INCOME, subcategory=_income_subcategory(tx))
    # 5. egreso
    if is_expense:
        return CategorizedMovement(**base, category=Category.EXPENSE, subcategory=_expense_subcategory(tx))
    return CategorizedMovement(**base, category=Category.EXCLUDED, subcategory="unknown_type")


def categorize_card_transaction(tx: dict[str, Any], fx: FxProvider) -> CategorizedMovement:
    occurred_at = parse_datetime(tx["createdAt"])
    amount = to_decimal(tx.get("amount"))
    amount_usd = to_usd(amount, tx.get("currency"), occurred_at, fx)
    status = tx.get("status")
    if status != "success":
        category, subcategory = Category.EXCLUDED, status or "unknown"
    elif amount is None:
        category, subcategory = Category.EXCLUDED, "no_data"
    else:
        category, subcategory = Category.EXPENSE, "card"
    return CategorizedMovement(
        id=tx["id"],
        source="card",
        occurred_at=occurred_at,
        category=category,
        subcategory=subcategory,
        amount=amount if amount is not None else Decimal(0),
        currency=tx.get("currency") or "",
        amount_usd=amount_usd,
        fee=None,
        taxes=None,
        counterparty_name=tx.get("description"),
        counterparty_key=None,
        raw_type="card",
        data_quality="full" if amount_usd is not None else "partial",
        description=tx.get("description"),
    )


def categorize(raw: RawData, fx: FxProvider | None = None) -> list[CategorizedMovement]:
    """Clasifica movimientos de ledger y de tarjeta. Función pura, sin I/O."""
    fx = fx or fx_for_rates(raw.fx_rates)
    own = self_accounts(raw.contacts)
    movements = [categorize_transaction(tx, own, fx) for tx in raw.transactions]
    for card_txs in raw.card_transactions.values():
        movements.extend(categorize_card_transaction(tx, fx) for tx in card_txs)
    movements.sort(key=lambda m: m.occurred_at, reverse=True)
    return movements


"""
Repository de belo (fuente real): adapta las respuestas crudas de la API
(`belo_scoring.models.RawData`) al modelo canónico.
"""

from collections.abc import Awaitable, Callable
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Any

from belo_scoring.models import RawData

from .base import merge
from .models import (
    BalanceRecord,
    Direction,
    Movement,
    MovementKind,
    ProfileData,
    SourceData,
    SourceInfo,
    parse_datetime,
)

SOURCE_ID = "belo"
SOURCE_NAME = "belo"


def is_synthetic(raw: RawData) -> bool:
    """Los perfiles demo marcan su RawData con `unavailable["demo"]`."""
    return "demo" in raw.unavailable


def source_info(raw: RawData) -> SourceInfo:
    return SourceInfo(id=SOURCE_ID, name=SOURCE_NAME, live=not is_synthetic(raw))

EXPENSE_TYPES = {"transfer", "withdrawal", "pix_payout"}


def _dec(value: Any) -> Decimal | None:
    if value is None or value == "":
        return None
    try:
        return Decimal(str(value))
    except InvalidOperation:
        return None


def _key(value: str | None) -> str | None:
    return value.strip().lower() if value else None


def self_accounts(contacts: list[dict[str, Any]]) -> set[str]:
    """Direcciones y belotags de los contactos `tier == "self"` (cuentas propias)."""
    keys: set[str] = set()
    for contact in contacts:
        if contact.get("tier") != "self":
            continue
        if contact.get("belotag"):
            keys.add(_key(contact["belotag"]))
        for account in contact.get("accounts") or []:
            for address in account.get("addresses") or []:
                if address.get("address"):
                    keys.add(_key(address["address"]))
    return keys


def _debits(receipt: dict[str, Any] | None) -> dict[str, Decimal]:
    totals: dict[str, Decimal] = {}
    for debit in (receipt or {}).get("debits") or []:
        amount = _dec(debit.get("amount"))
        if amount is not None and debit.get("currency"):
            totals[debit["currency"]] = totals.get(debit["currency"], Decimal(0)) + amount
    return totals


def ledger_movement(tx: dict[str, Any]) -> Movement:
    receipt = tx.get("receipt")
    counterparty = (receipt or {}).get("counterparty") or {}
    metadata = tx.get("metadata") or {}
    type_ = tx["type"]
    is_expense = type_ in EXPENSE_TYPES

    # Monto: en egresos, la suma de `debits` (ya incluye fee y taxes)
    debits = _debits(receipt)
    amount, currency = _dec(tx.get("amount")), tx.get("currency")
    if is_expense and len(debits) == 1:
        currency, amount = next(iter(debits.items()))
    elif amount is None and receipt is not None:
        amount, currency = _dec(receipt.get("netAmount")), receipt.get("netCurrency")

    rail = counterparty.get("accountType") or (receipt or {}).get("network") or metadata.get("addressType")
    if type_ == "pix_payout":
        rail = "PIX"

    if type_ == "swap":
        kind, direction = MovementKind.SWAP, None
        conversion = (receipt or {}).get("conversion") or (
            {"pairCode": metadata.get("pairCode"), "type": metadata.get("type")} if metadata.get("pairCode") else None)
    else:
        kind = MovementKind.TRANSFER
        direction = Direction.OUT if is_expense else Direction.IN
        conversion = (receipt or {}).get("conversion")

    ids = [i for i in (_key(counterparty.get("account")), _key(counterparty.get("belotag"))) if i]
    return Movement(
        id=tx["id"],
        source=SOURCE_ID,
        kind=kind,
        direction=direction,
        status=tx.get("status") or "pending",
        occurred_at=parse_datetime(tx["createdAt"]),
        amount=amount,
        currency=currency or "",
        fee=_dec((receipt or {}).get("fee")),
        fee_currency=(receipt or {}).get("feeCurrency"),
        taxes=_dec((receipt or {}).get("taxes")),
        tax_currency=(receipt or {}).get("taxCurrency"),
        debits=debits,
        rail=rail,
        counterparty_name=counterparty.get("name"),
        counterparty_key=counterparty.get("account") or counterparty.get("belotag"),
        counterparty_ids=ids,
        conversion=conversion,
        raw_type=type_,
        has_receipt=receipt is not None,
    )


def card_movement(tx: dict[str, Any], card: dict[str, Any] | None) -> Movement:
    return Movement(
        id=tx["id"],
        source=SOURCE_ID,
        kind=MovementKind.CARD,
        direction=Direction.OUT,
        status=tx.get("status") or "pending",
        occurred_at=parse_datetime(tx["createdAt"]),
        amount=_dec(tx.get("amount")),
        currency=tx.get("currency") or "",
        rail="CARD",
        counterparty_name=tx.get("description"),
        description=tx.get("description"),
        card_last4=(card or {}).get("lastFour"),
        card_brand=(card or {}).get("brand"),
        raw_type="card",
    )


def _balances(raw: RawData) -> list[BalanceRecord]:
    records = []
    for b in raw.balances:
        earned = b.get("earned") or {}
        records.append(BalanceRecord(
            source=SOURCE_ID,
            account_id=f"balance-{b['currencyCode']}",
            kind="wallet",
            name="Cuenta Belo" if b["currencyCode"] in ("ARGt", "ARS") else f"Wallet {b['currencyCode']}",
            currency=b["currencyCode"],
            available=_dec(b.get("available")) or Decimal(0),
            earned_total=_dec(earned.get("total")) or Decimal(0),
            earned_month=_dec(earned.get("month")) or Decimal(0),
            rate=(b.get("yield") or {}).get("rate"),
        ))
    for v in raw.vaults:
        # El detalle trae `earned`; el listado no
        detail = raw.vault_details.get(str(v["id"]), v)
        earned = detail.get("earned")
        details = detail.get("details") or {}
        records.append(BalanceRecord(
            source=SOURCE_ID,
            account_id=f"vault-{detail['id']}",
            kind="vault",
            name=details.get("name") or "Vault",
            currency=detail["currencyCode"],
            available=_dec(detail.get("balance")) or Decimal(0),
            earned_total=_dec(earned.get("total")) if earned else None,
            earned_month=_dec(earned.get("month")) if earned else None,
            rate=detail.get("rate"),
            goal_amount=_dec(details.get("goalAmount")),
        ))
    return records


def belo_source_data(raw: RawData) -> SourceData:
    cards = {str(c["id"]): c for c in raw.cards}
    movements = [ledger_movement(tx) for tx in raw.transactions]
    for card_id, txs in raw.card_transactions.items():
        movements.extend(card_movement(tx, cards.get(card_id)) for tx in txs)
    return SourceData(
        source=SOURCE_ID,
        live=not is_synthetic(raw),
        movements=movements,
        balances=_balances(raw),
        own_accounts=self_accounts(raw.contacts),
        fx_rates=raw.fx_rates,
        declared_brackets=raw.declared_brackets,
        card_application_status=(raw.card_application or {}).get("status"),
        unavailable=dict(raw.unavailable),
    )


def as_profile(data: RawData | ProfileData) -> ProfileData:
    """Acepta el RawData de belo (compatibilidad) o un ProfileData ya combinado."""
    if isinstance(data, ProfileData):
        return data
    return merge([(source_info(data), belo_source_data(data))], data.fetched_at, data.window_from, data.window_to)


class BeloRepository:
    """Fuente real. `loader` trae el RawData (API en vivo, disco o perfil demo)."""

    id = SOURCE_ID
    name = SOURCE_NAME
    live = True

    def __init__(self, loader: Callable[[], Awaitable[RawData]]):
        self._loader = loader
        self.raw: RawData | None = None

    async def fetch(self, subject_id: str, window_from: datetime, window_to: datetime) -> SourceData:
        self.raw = await self._loader()
        return belo_source_data(self.raw)

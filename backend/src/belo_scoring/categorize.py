"""
Clasificación de movimientos del modelo canónico (cualquier fuente). Lógica pura, sin I/O.

Reglas en orden; gana la primera que aplica:
1. status != success          -> EXCLUDED / pending|failed
2. sin monto                  -> EXCLUDED / no_data
3. swap                       -> INTERNAL / conversion
4. contraparte propia         -> INTERNAL / self_transfer (también entre fuentes)
5. tarjeta                    -> EXPENSE / card (reintegro: INCOME / card_refund)
6. pago de servicios          -> EXPENSE / bill
7. impuesto                   -> EXPENSE / tax
8. liquidación de plataforma  -> INCOME / platform
9. compra en plataforma       -> EXPENSE / platform_purchase
10. transferencia que entra   -> INCOME / rail
11. transferencia que sale    -> EXPENSE / rail
(rendimientos -> INCOME / yield, como agregado en savings, no acá)
"""

from decimal import Decimal

from sources.models import Direction, Movement, MovementKind, ProfileData

from .fx import FxProvider, fx_for_rates, to_usd
from .models import Category, CategorizedMovement, RawData

BANK_RAILS = {"CVU", "CBU", "ALIAS"}
P2P_RAILS = {"BELOTAG", "USER", "EMAIL"}
PIX_RAILS = {"PIX"}
ONCHAIN_RAILS = {
    "BITCOIN", "BITCOIN_LIGHTNING", "ETHEREUM", "TRON", "POLYGON", "OPTIMISM",
    "ARBITRUM_ONE", "BSC", "SOLANA", "PLASMA", "BASE", "STELLAR", "AVALANCHE",
}


def _income_subcategory(m: Movement) -> str:
    if not m.has_receipt:
        return "other"
    if m.rail in BANK_RAILS:
        return "bank_transfer"
    if m.rail in P2P_RAILS:
        return "p2p_belo"
    if m.rail in ONCHAIN_RAILS or (not m.counterparty_ids and m.counterparty_name is None):
        return "crypto_deposit"
    return "other"


def _expense_subcategory(m: Movement) -> str:
    if m.rail in BANK_RAILS:
        return "bank_transfer"
    if m.rail in P2P_RAILS:
        return "p2p_belo"
    if m.rail in ONCHAIN_RAILS:
        return "crypto_withdrawal"
    if m.rail in PIX_RAILS:
        return "pix"
    return "other"


def _amount_usd(m: Movement, fx: FxProvider) -> Decimal | None:
    if m.direction == Direction.OUT and m.debits:
        converted = [to_usd(a, c, m.occurred_at, fx, m.conversion) for c, a in m.debits.items()]
        return None if any(v is None for v in converted) else sum(converted, Decimal(0))
    return to_usd(m.amount, m.currency, m.occurred_at, fx, m.conversion)


def categorize_movement(m: Movement, own: set[str], fx: FxProvider) -> CategorizedMovement:
    amount_usd = _amount_usd(m, fx)
    base = dict(
        id=m.id,
        source="card" if m.kind == MovementKind.CARD else "ledger",
        provider=m.source,
        kind=m.kind.value,
        occurred_at=m.occurred_at,
        amount=m.amount if m.amount is not None else Decimal(0),
        currency=m.currency,
        amount_usd=amount_usd,
        fee=m.fee,
        fee_currency=m.fee_currency,
        taxes=m.taxes,
        tax_currency=m.tax_currency,
        debits=m.debits,
        counterparty_name=m.counterparty_name,
        counterparty_key=m.counterparty_key,
        raw_type=m.raw_type,
        data_quality="partial" if not m.has_receipt or amount_usd is None else "full",
        description=m.description,
    )

    def result(category: Category, subcategory: str, **extra) -> CategorizedMovement:
        return CategorizedMovement(**base, category=category, subcategory=subcategory, **extra)

    # 1-2. pending / failed se guardan aparte; sin monto no hay nada que contar
    if m.status != "success":
        return result(Category.EXCLUDED, m.status or "unknown")
    if m.amount is None:
        return result(Category.EXCLUDED, "no_data")
    # 3. swap
    if m.kind == MovementKind.SWAP:
        return result(Category.INTERNAL, "conversion",
                      swap_pair=(m.conversion or {}).get("pairCode"),
                      swap_direction=(m.conversion or {}).get("type"))
    # 4. cuenta propia (en la misma fuente o en otra fuente conectada)
    if m.kind == MovementKind.TRANSFER and own & {i.lower() for i in m.counterparty_ids}:
        return result(Category.INTERNAL, "self_transfer")
    incoming = m.direction == Direction.IN
    if m.kind == MovementKind.CARD:
        return result(Category.INCOME, "card_refund") if incoming else result(Category.EXPENSE, "card")
    if m.kind == MovementKind.BILL:
        return result(Category.EXPENSE, "bill")
    if m.kind == MovementKind.TAX:
        return result(Category.EXPENSE, "tax")
    if m.kind == MovementKind.PAYOUT:
        return result(Category.INCOME, "platform")
    if m.kind == MovementKind.PURCHASE:
        return result(Category.EXPENSE, "platform_purchase")
    if incoming:
        return result(Category.INCOME, _income_subcategory(m))
    if m.direction == Direction.OUT:
        return result(Category.EXPENSE, _expense_subcategory(m))
    return result(Category.EXCLUDED, "unknown_type")


def categorize(data: RawData | ProfileData, fx: FxProvider | None = None) -> list[CategorizedMovement]:
    """Clasifica los movimientos de todas las fuentes. Función pura, sin I/O."""
    from sources.belo import as_profile  # import local: sources.belo depende de este paquete

    profile = as_profile(data)
    fx = fx or fx_for_rates(profile.fx_rates)
    movements = [categorize_movement(m, profile.own_accounts, fx) for m in profile.movements]
    movements.sort(key=lambda m: m.occurred_at, reverse=True)
    return movements

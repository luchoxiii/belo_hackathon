"""
Payload del panel de gastos con la forma de mocks/mock-transactions.json,
construido desde todas las fuentes del usuario (ProfileData). Lógica pura, sin I/O.

Los montos se calculan en Decimal; recién al serializar se pasan a número JSON,
como en el mock. `amountArs` usa la cotización guardada en el raw.
"""

from collections import Counter, defaultdict
from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal
from statistics import median
from typing import Any

from belo_scoring import categorize, fx_for_rates
from belo_scoring.fx import normalize_currency
from belo_scoring.models import Category, CategorizedMovement, RawData
from sources.belo import as_profile
from sources.models import ProfileData
from sources.registry import source_name

from .categories import dashboard_category, dashboard_method

SCHEMA_VERSION = "1.0.0"
SALARY_MIN_MONTHS = 3      # mismo pagador en al menos 3 meses distintos
SALARY_MAX_PER_MONTH = 2   # como mucho 2 depósitos por mes (descarta ventas y liquidaciones semanales)
SALARY_MAX_CV = Decimal("0.25")  # monto estable


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _ars_int(value: Decimal | None) -> Decimal | None:
    return value.quantize(Decimal(1), rounding=ROUND_HALF_UP) if value is not None else None


def _json_number(value: Any) -> Any:
    """Decimal -> int/float solo en el borde de serialización (el mock usa números)."""
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    if isinstance(value, dict):
        return {k: _json_number(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_json_number(v) for v in value]
    return value


def _salary_payers(movements: list[CategorizedMovement]) -> set[str]:
    """Pagador tipo sueldo: mismo pagador en >= 3 meses, monto estable y pocos depósitos por mes."""
    by_payer: dict[str, list[CategorizedMovement]] = defaultdict(list)
    for m in movements:
        if m.category == Category.INCOME and m.subcategory not in ("platform", "card_refund") and m.counterparty_key:
            by_payer[m.counterparty_key].append(m)
    payers = set()
    for key, items in by_payer.items():
        months = {m.occurred_at.strftime("%Y-%m") for m in items}
        amounts = [m.amount_usd if m.amount_usd is not None else m.amount for m in items]
        mean = sum(amounts, Decimal(0)) / len(amounts)
        if len(months) < SALARY_MIN_MONTHS or len(items) > SALARY_MAX_PER_MONTH * len(months) or not mean:
            continue
        cv = (sum(((a - mean) ** 2 for a in amounts), Decimal(0)) / len(amounts)).sqrt() / mean
        if cv <= SALARY_MAX_CV:
            payers.add(key)
    return payers


def _description(m: CategorizedMovement, category: str, base_asset: str | None) -> str:
    name = m.counterparty_name or m.description or "belo"
    if m.source == "card":
        return m.description or "Consumo con tarjeta"
    if category == "compra_crypto":
        return f"Compra de {base_asset or 'crypto'}"
    if category == "venta_crypto":
        return f"Venta de {base_asset or 'crypto'}"
    if m.category == Category.EXPENSE:
        return f"Transferencia a {name}"
    return name


def build_transactions_payload(data: RawData | ProfileData, subject_id: str,
                               profile_name: str | None = None) -> dict[str, Any]:
    profile = as_profile(data)
    fx = fx_for_rates(profile.fx_rates)
    movements = categorize(profile, fx)
    salary_payers = _salary_payers(movements)
    canonical = {m.id: m for m in profile.movements}

    def amount_ars(m: CategorizedMovement) -> Decimal | None:
        if normalize_currency(m.currency) == "ARS":
            return m.amount
        rate = fx.get_rate("ARS", m.occurred_at)
        return m.amount_usd * rate if m.amount_usd is not None and rate else None

    transactions = []
    for m in sorted(movements, key=lambda m: m.occurred_at):
        category = dashboard_category(m, salary_payers)
        if category is None:
            continue
        source_movement = canonical[m.id]
        conversion = source_movement.conversion or {}
        base_asset = (conversion.get("pairCode") or m.swap_pair or "").split("/")[0] or None
        item: dict[str, Any] = {
            "id": m.id,
            "type": "credit" if m.category == Category.INCOME or category == "venta_crypto" else "debit",
            "category": category,
            "amount": m.amount,
            "currency": normalize_currency(m.currency),
            "amountArs": _ars_int(amount_ars(m)),
            "description": _description(m, category, base_asset),
            "method": dashboard_method(m),
            "createdAt": _iso(m.occurred_at),
            "merchant": _merchant(m),
            "source": m.provider,
        }
        if source_movement.card_last4 or source_movement.card_brand:
            item["card"] = {"last4": source_movement.card_last4, "brand": source_movement.card_brand}
        if conversion:
            item["crypto"] = {
                "asset": base_asset,
                "amount": Decimal(conversion["baseAmount"]) if conversion.get("baseAmount") else None,
                "priceArs": Decimal(conversion["price"]) if conversion.get("price") else None,
            }
        transactions.append(item)

    return _json_number({
        "version": SCHEMA_VERSION,
        "generatedAt": _iso(profile.fetched_at),
        "profile": _profile(subject_id, profile_name, movements, salary_payers, transactions),
        "accounts": _accounts(profile),
        "transactions": transactions,
        "dateRange": {"from": profile.window_from.date().isoformat(), "to": profile.window_to.date().isoformat()},
        "stats": _stats(transactions),
    })


def _profile(subject_id: str, name: str | None, movements: list[CategorizedMovement],
             salary_payers: set[str], transactions: list[dict]) -> dict[str, Any]:
    # Sin datos personales inventados: solo lo que se deriva de los movimientos
    salaries = [t for t in transactions if t["category"] == "salario" and t["amountArs"] is not None]
    employment = None
    if salaries:
        payer_names = Counter(m.counterparty_name for m in movements
                              if m.counterparty_key in salary_payers and m.counterparty_name)
        employment = {
            "type": "empleado",
            "company": payer_names.most_common(1)[0][0] if payer_names else None,
            "position": None,
            "monthlySalary": _ars_int(median(t["amountArs"] for t in salaries)),
            "payDay": Counter(int(t["createdAt"][8:10]) for t in salaries).most_common(1)[0][0],
        }
    return {"id": subject_id, "name": name, "familyMembers": [], "employment": employment, "location": None}


def _merchant(m: CategorizedMovement) -> str:
    # En transferencias el comercio es la contraparte; en tarjeta, la descripción del consumo
    if m.source == "card":
        return m.description or m.counterparty_name or source_name(m.provider)
    return m.counterparty_name or m.description or source_name(m.provider)


def _accounts(profile: ProfileData) -> list[dict[str, Any]]:
    updated_at = _iso(profile.fetched_at)
    accounts = []
    for b in profile.balances:
        if not b.available and b.kind == "wallet":
            continue
        currency = normalize_currency(b.currency)
        if b.kind == "vault":
            type_ = "savings"
        else:
            type_ = "checking" if currency == "ARS" else "crypto"
        accounts.append({
            "id": f"{b.source}-{b.account_id}" if b.source != "belo" else b.account_id,
            "type": type_,
            "name": b.name,
            "currency": currency,
            "balance": {"currency": currency, "available": b.available, "updatedAt": updated_at},
            "source": b.source,
        })
    return accounts


def _stats(transactions: list[dict]) -> dict[str, Any]:
    def total(type_: str) -> Decimal:
        return sum((t["amountArs"] for t in transactions if t["type"] == type_ and t["amountArs"] is not None),
                   Decimal(0))

    months = {t["createdAt"][:7] for t in transactions} or {""}
    income, expenses = total("credit"), total("debit")
    return {
        "totalTransactions": len(transactions),
        "totalIncome": income,
        "totalExpenses": expenses,
        "averageMonthlyIncome": _ars_int(income / len(months)),
        "averageMonthlyExpenses": _ars_int(expenses / len(months)),
    }

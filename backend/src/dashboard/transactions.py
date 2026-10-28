"""
Payload del panel de gastos con la forma de mocks/mock-transactions.json,
construido desde los datos crudos de belo (RawData). Lógica pura, sin I/O.

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

from .categories import dashboard_category, dashboard_method

SCHEMA_VERSION = "1.0.0"
SALARY_MIN_MONTHS = 3  # mismo pagador en al menos 3 meses distintos


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
    months: dict[str, set[str]] = defaultdict(set)
    for m in movements:
        if m.category == Category.INCOME and m.counterparty_key:
            months[m.counterparty_key].add(m.occurred_at.strftime("%Y-%m"))
    return {key for key, ms in months.items() if len(ms) >= SALARY_MIN_MONTHS}


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


def build_transactions_payload(raw: RawData, subject_id: str, profile_name: str | None = None) -> dict[str, Any]:
    fx = fx_for_rates(raw.fx_rates)
    movements = categorize(raw, fx)
    salary_payers = _salary_payers(movements)
    ledger_by_id = {tx["id"]: tx for tx in raw.transactions}
    cards_by_id = {str(c["id"]): c for c in raw.cards}
    card_of_tx = {tx["id"]: cards_by_id.get(card_id)
                  for card_id, txs in raw.card_transactions.items() for tx in txs}

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
        conversion = ((ledger_by_id.get(m.id) or {}).get("receipt") or {}).get("conversion") or {}
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
            "merchant": m.description or m.counterparty_name or "belo",
        }
        card = card_of_tx.get(m.id)
        if card:
            item["card"] = {"last4": card.get("lastFour"), "brand": card.get("brand")}
        if conversion:
            item["crypto"] = {
                "asset": base_asset,
                "amount": Decimal(conversion["baseAmount"]) if conversion.get("baseAmount") else None,
                "priceArs": Decimal(conversion["price"]) if conversion.get("price") else None,
            }
        transactions.append(item)

    return _json_number({
        "version": SCHEMA_VERSION,
        "generatedAt": _iso(raw.fetched_at),
        "profile": _profile(subject_id, profile_name, movements, salary_payers, transactions),
        "accounts": _accounts(raw, fx),
        "transactions": transactions,
        "dateRange": {"from": raw.window_from.date().isoformat(), "to": raw.window_to.date().isoformat()},
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


def _accounts(raw: RawData, fx) -> list[dict[str, Any]]:
    updated_at = _iso(raw.fetched_at)
    accounts = []
    for b in raw.balances:
        available = Decimal(b.get("available") or "0")
        if not available:
            continue
        currency = normalize_currency(b["currencyCode"])
        is_peso = currency == "ARS"
        accounts.append({
            "id": f"balance-{b['currencyCode']}",
            "type": "checking" if is_peso or b.get("type") == "fiat" else "crypto",
            "name": "Cuenta Belo" if is_peso else f"Wallet {b['currencyCode']}",
            "currency": currency,
            "balance": {"currency": currency, "available": available, "updatedAt": updated_at},
        })
    for v in raw.vaults:
        detail = raw.vault_details.get(str(v["id"]), v)
        currency = normalize_currency(detail["currencyCode"])
        accounts.append({
            "id": f"vault-{detail['id']}",
            "type": "savings",
            "name": (detail.get("details") or {}).get("name") or "Vault",
            "currency": currency,
            "balance": {"currency": currency, "available": Decimal(detail.get("balance") or "0"),
                        "updatedAt": updated_at},
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

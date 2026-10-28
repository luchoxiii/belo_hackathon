"""
Perfiles sintéticos para demo y tests: RawData con la forma de las respuestas de belo.

Las fechas son relativas a `now`: siempre hay 5 meses completos antes del mes en curso.
🛡️ Solo para demo. Nunca activar BELO_DEMO_PROFILE en producción.
"""

from collections.abc import Callable
from datetime import datetime, timedelta, timezone
from typing import Any

from belo_scoring.models import RawData

WINDOW_DAYS = 180


def _months_before(now: datetime, count: int) -> list[str]:
    """Los `count` meses completos anteriores al mes de `now`, como YYYY-MM."""
    index = now.year * 12 + now.month - 1
    return [f"{(i - 1) // 12:04d}-{(i - 1) % 12 + 1:02d}" for i in range(index - count + 1, index + 1)]


def _receipt(counterparty: dict | None = None, debits: list | None = None) -> dict[str, Any]:
    return {
        "counterparty": counterparty, "debits": debits or [], "netAmount": None, "netCurrency": None,
        "fee": None, "feeCurrency": None, "taxes": None, "taxCurrency": None, "conversion": None,
        "network": None, "transactionHash": None, "explorerUrl": None, "bankReference": None,
    }


def _counterparty(account_type: str, account: str) -> dict[str, Any]:
    return {"name": account.title(), "bank": None, "belotag": None, "account": account, "accountType": account_type}


def _tx(type_: str, month: str, day: str, amount: str, receipt: dict) -> dict[str, Any]:
    created_at = f"{month}-{day}T12:00:00.000Z"
    return {
        "id": f"demo-{type_}-{month}-{day}-{amount}", "type": type_, "status": "success",
        "amount": amount, "currency": "USDT", "metadata": None, "receipt": receipt,
        "createdAt": created_at, "updatedAt": created_at,
    }


def deposit(month: str, amount: str, payer: str, day: str = "05") -> dict[str, Any]:
    return _tx("deposit", month, day, amount, _receipt(_counterparty("CVU", payer)))


def expense(month: str, amount: str, account: str = "alquiler", day: str = "20") -> dict[str, Any]:
    return _tx("transfer", month, day, amount,
               _receipt(_counterparty("ALIAS", account), [{"currency": "USDT", "amount": amount}]))


def usdt_balance(available: str) -> dict[str, Any]:
    return {"currencyCode": "USDT", "name": "Tether USD", "type": "stablecoin", "decimals": 6,
            "available": available, "earned": {"total": "0", "today": "0", "month": "0"}}


def vault_with_goal(balance: str, goal: str) -> dict[str, Any]:
    return {"id": "demo-vault", "currencyCode": "USDT", "balance": balance, "isYieldActive": True,
            "rate": "4.00%", "details": {"name": "Meta", "goalAmount": goal}}


def _raw(now: datetime, **data: Any) -> RawData:
    return RawData(fetched_at=now, window_from=now - timedelta(days=WINDOW_DAYS), window_to=now,
                   unavailable={"demo": "synthetic_profile"}, **data)


def salaried(now: datetime) -> RawData:
    """Sueldo fijo USD 2000/mes del mismo empleador, gasta 1000/mes, con colchón y meta."""
    txs = []
    for m in _months_before(now, 5):
        txs += [deposit(m, "2000", "empleador"), expense(m, "600"), expense(m, "400", "super", day="25")]
    return _raw(now, transactions=txs, balances=[usdt_balance("3000")],
                vaults=[vault_with_goal("1000", "5000")])


def erratic(now: datetime) -> RawData:
    """Ingresos irregulares de distintos pagadores, meses con déficit, sin ahorro."""
    amounts = ["3000", "0", "200", "2500", "100"]
    txs = []
    for i, (m, amount) in enumerate(zip(_months_before(now, 5), amounts)):
        if amount != "0":
            txs.append(deposit(m, amount, f"cliente{i}"))
        txs.append(expense(m, "1100"))
    return _raw(now, transactions=txs, balances=[usdt_balance("50")])


def short_history(now: datetime) -> RawData:
    """Un solo mes de movimientos."""
    [m] = _months_before(now, 1)
    return _raw(now, transactions=[deposit(m, "2000", "empleador"), expense(m, "500")])


PROFILES: dict[str, Callable[[datetime], RawData]] = {
    "salaried": salaried,
    "erratic": erratic,
    "short_history": short_history,
}


def demo_raw(profile: str, now: datetime | None = None) -> RawData:
    if profile not in PROFILES:
        raise ValueError(f"Perfil demo desconocido '{profile}'. Opciones: {', '.join(PROFILES)}")
    return PROFILES[profile](now or datetime.now(timezone.utc))

"""
Perfiles sintéticos para demo y tests: RawData con la forma de las respuestas de belo.

Las fechas son relativas a `now`: siempre hay 5 meses completos antes del mes en curso.
🛡️ Solo para demo. Nunca activar BELO_DEMO_PROFILE en producción.
"""

import random
from collections.abc import Callable
from datetime import date, datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from belo_scoring.models import RawData

WINDOW_DAYS = 730  # 2 años de historial


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


def _tx(type_: str, month: str, day: str, amount: str, receipt: dict, currency: str = "USDT",
        metadata: dict | None = None) -> dict[str, Any]:
    created_at = f"{month}-{day}T12:00:00.000Z"
    return {
        "id": f"demo-{type_}-{month}-{day}-{amount}", "type": type_, "status": "success",
        "amount": amount, "currency": currency, "metadata": metadata, "receipt": receipt,
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
    # Cotización sintética para todos los perfiles: las fuentes dummy suman movimientos en ARS
    data.setdefault("fx_rates", _fx_table(now))
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


# --- Perfil "family": hogar en ARS con gastos variados, para el dashboard ---

def _ars_rate(day: date) -> Decimal:
    """Cotización sintética ARS por USD: sube ~0,5 por día desde 1000 (2024-10-01)."""
    base_date = date(2024, 10, 1)
    base_rate = Decimal(1000)
    daily_increase = Decimal("0.5")
    return (base_rate + daily_increase * (day - base_date).days).quantize(Decimal("0.01"))


def _fx_table(now: datetime) -> dict[str, dict[str, str]]:
    start = (now - timedelta(days=WINDOW_DAYS + 7)).date()
    return {"ARS": {
        (start + timedelta(days=i)).isoformat(): str(_ars_rate(start + timedelta(days=i)))
        for i in range((now.date() - start).days + 1)
    }}


# Inflación mensual para ajustar montos (realista para Argentina ~1.5-2% mensual)
MONTHLY_INFLATION = Decimal("0.017")  # 1.7% mensual

# (día, monto base ARS en mes 0, destinatario, tipo de cuenta, ajusta por inflación, spread)
# spread: variación aleatoria adicional (ej: 0.05 = ±5%)
FAMILY_FIXED = [
    ("07", 420000, "OSDE", "CVU", True, 0.02),           # Prepaga sube con inflación
    ("08", 280000, "Colegio San Martín", "CBU", True, 0.0),  # Cuota fija por cuatrimestre
    ("10", 650000, "Inmobiliaria Palermo", "ALIAS", True, 0.0),  # Alquiler ajusta cada 3-6 meses
    ("10", 185000, "Consorcio Av. Santa Fe 1234", "CVU", True, 0.08),  # Expensas varían más
    ("12", 35000, "Fibertel", "CVU", True, 0.03),        # Servicios suben gradualmente
    ("12", 28000, "Personal", "CVU", True, 0.05),
    ("15", 45000, "Edenor", "CVU", True, 0.15),          # Luz varía mucho por consumo
    ("16", 30000, "Metrogas", "CVU", True, 0.20),        # Gas varía por estación
    ("17", 12000, "AySA", "CVU", True, 0.05),
]

# (comercio, rango ARS, veces por mes) de los consumos con tarjeta
FAMILY_CARD = [
    (("Jumbo", "Carrefour", "Coto"), (25000, 90000), 5),
    (("Shell", "YPF", "Axion"), (45000, 70000), 3),
    (("Parrilla Don Julio", "Café Martínez", "Pizzería Güerrín"), (15000, 60000), 3),
    (("Farmacity",), (10000, 35000), 1),
    (("Uber",), (4000, 12000), 2),
]


def family(now: datetime) -> RawData:
    """Hogar con sueldo en ARS, servicios, alquiler, tarjeta y compra mensual de USDT. 2 años de historial."""
    rng = random.Random(42)
    current = now.strftime("%Y-%m")
    months = _months_before(now, 23) + [current]  # 24 meses totales
    txs: list[dict[str, Any]] = []
    card_txs: list[dict[str, Any]] = []

    def happened(month: str, day: str) -> bool:
        return month != current or int(day) < now.day

    def ars(base: int, spread: float = 0.1) -> str:
        return str(int(base * (1 + rng.uniform(-spread, spread)) / 10) * 10)

    for i, m in enumerate(months):
        if happened(m, "05"):
            txs.append(_tx("deposit", m, "05", "2800000.00",
                           _receipt({"name": "Tech Solutions SA", "bank": "Banco Galicia", "belotag": None,
                                     "account": "tech.solutions.sueldos", "accountType": "ALIAS"}),
                           currency="ARGt"))
        # Ingreso freelance cada 2-3 meses (aproximadamente)
        if i % 3 in (1, 2) and happened(m, "20"):
            txs.append(_tx("deposit", m, "20", ars(450000, 0.3),
                           _receipt(_counterparty("CVU", "freelance estudio creativo")), currency="ARGt"))

        for day, base, name, account_type, adjusts_inflation, spread in FAMILY_FIXED:
            if not happened(m, day):
                continue
            # Aplicar inflación acumulada desde el mes 0
            if adjusts_inflation:
                inflation_factor = (1 + float(MONTHLY_INFLATION)) ** i
                adjusted_base = int(base * inflation_factor)
            else:
                adjusted_base = base
            # Aplicar variación aleatoria
            amount = ars(adjusted_base, spread)
            cp = {"name": name, "bank": None, "belotag": None,
                  "account": name.lower().replace(" ", "."), "accountType": account_type}
            txs.append(_tx("transfer", m, day, amount,
                           _receipt(cp, [{"currency": "ARGt", "amount": amount}]), currency="ARGt"))

        # Compra mensual de USDT con pesos
        if happened(m, "06"):
            price = _ars_rate(date.fromisoformat(f"{m}-06"))
            quote = Decimal(300000)
            conversion = {"pairCode": "USDT/ARGt", "type": "BUY", "price": str(price),
                          "baseAmount": str((quote / price).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)),
                          "quoteAmount": str(quote)}
            receipt = _receipt(None, [{"currency": "ARGt", "amount": str(quote)}])
            receipt["conversion"] = conversion
            txs.append(_tx("swap", m, "06", str(quote), receipt, currency="ARGt",
                           metadata={"pairCode": "USDT/ARGt", "type": "BUY"}))

        for merchants, (low, high), per_month in FAMILY_CARD:
            for _ in range(per_month):
                day = f"{rng.randint(1, 28):02d}"
                if happened(m, day):
                    card_txs.append({
                        "id": f"demo-card-{m}-{len(card_txs)}", "status": "success",
                        "amount": str(rng.randint(low, high) // 10 * 10), "currency": "ARS",
                        "description": rng.choice(merchants).upper(), "createdAt": f"{m}-{day}T15:30:00.000Z",
                    })
        for day, amount, merchant in (("03", "9500", "NETFLIX.COM"), ("04", "5500", "SPOTIFY")):
            if happened(m, day):
                card_txs.append({"id": f"demo-card-{m}-{merchant}", "status": "success", "amount": amount,
                                 "currency": "ARS", "description": merchant, "createdAt": f"{m}-{day}T09:00:00.000Z"})

    card_txs.sort(key=lambda t: t["createdAt"], reverse=True)
    txs.sort(key=lambda t: t["createdAt"], reverse=True)
    return _raw(
        now,
        transactions=txs,
        cards=[{"id": "demo-card", "name": "Tarjeta belo", "lastFour": "4532", "brand": "visa",
                "type": "virtual", "status": "active", "canFreeze": True}],
        card_transactions={"demo-card": card_txs},
        card_application={"status": "approved", "acceptedTerms": True},
        balances=[
            {"currencyCode": "ARGt", "name": "Argentine Peso Token", "type": "fiat_token", "decimals": 2,
             "available": "2500000.00", "earned": {"total": "0", "today": "0", "month": "0"}},
            usdt_balance("4500.000000"),
            {"currencyCode": "BTC", "name": "Bitcoin", "type": "crypto", "decimals": 8,
             "available": "0.02500000", "earned": {"total": "0", "today": "0", "month": "0"}},
        ],
        vaults=[{"id": "demo-vault-vacaciones", "currencyCode": "USDT", "balance": "2500.00", "isYieldActive": True,
                 "rate": "4.00%", "details": {"name": "Vacaciones", "goalAmount": "5000"}}],
        fx_rates=_fx_table(now),
        declared_brackets={"annual_revenue": "from_20000_to_50000", "monthly_card_spend": "from_0_to_500"},
    )


PROFILES: dict[str, Callable[[datetime], RawData]] = {
    "salaried": salaried,
    "erratic": erratic,
    "short_history": short_history,
    "family": family,
}

# Nombre visible del perfil en el dashboard (sintético, no es una persona real)
PROFILE_NAMES = {
    "salaried": "Usuario demo · Asalariado",
    "erratic": "Usuario demo · Ingresos irregulares",
    "short_history": "Usuario demo · Cuenta nueva",
    "family": "Usuario demo · Familia",
}


def demo_profile(profile: str, now: datetime | None = None):
    """Perfil demo con las fuentes dummy conectadas (las elegidas por el usuario o el default del perfil)."""
    from sources.registry import connected_source_ids, profile_from_raw

    subject_id = f"demo-{profile}"
    return profile_from_raw(demo_raw(profile, now), subject_id, connected_source_ids(subject_id, profile))


def demo_raw(profile: str, now: datetime | None = None) -> RawData:
    if profile not in PROFILES:
        raise ValueError(f"Perfil demo desconocido '{profile}'. Opciones: {', '.join(PROFILES)}")
    return PROFILES[profile](now or datetime.now(timezone.utc))

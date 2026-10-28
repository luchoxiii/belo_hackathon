from decimal import Decimal, InvalidOperation
import os

from fastmcp import FastMCP
from fastmcp.exceptions import ToolError
from fastmcp.server.dependencies import get_http_headers

from belo_client import BeloAPIError, BeloAuthError
from scoring_engine import OfferError
from scoring_engine.service import demo_decision, get_decision, public_offer, public_profile, public_simulation

mcp = FastMCP("SavingsWalletMVP")

# 🛡️ Datos propios (env vars, sin datos sensibles)
SALDO_INICIAL = float(os.getenv("SALDO_INICIAL", "100000"))
TASA_WALLET_ANUAL = float(os.getenv("TASA_WALLET_ANUAL", "0.20"))
GASTOS_MENSUALES = float(os.getenv("GASTOS_MENSUALES", "50000"))

# 🛡️ Inflación mensual proyectada (REM septiembre 2026)
INFLACION_MENSUAL_PROYECTADA = 0.017  # 1.7%

# 🛡️ Promociones hardcodeadas (octubre 2026)
PROMOTIONS = [
    {
        "id": "cuenta_dni_ferias",
        "wallet": "Cuenta DNI",
        "category": "supermercado",
        "discount_pct": 40,
        "weekly_cap": 6000,
        "days": "todos los días",
        "description": "40% en Ferias y Mercados Bonaerenses. Tope $6.000/semana."
    },
    {
        "id": "cuenta_dni_garrafas",
        "wallet": "Cuenta DNI",
        "category": "hogar",
        "discount_pct": 40,
        "monthly_cap": 18000,
        "days": "todos los días",
        "description": "40% en garrafas. Tope $18.000/mes."
    },
    {
        "id": "cuenta_dni_chango",
        "wallet": "Cuenta DNI",
        "category": "supermercado",
        "discount_pct": 20,
        "weekly_cap": None,
        "days": "jueves",
        "description": "20% en Chango Más. Sin tope ni mínimo."
    },
    {
        "id": "cuenta_dni_carrefour",
        "wallet": "Cuenta DNI",
        "category": "supermercado",
        "discount_pct": 10,
        "weekly_cap": None,
        "days": "miércoles",
        "description": "10% en Carrefour. Sin tope. Compra mínima $15.000."
    }
]


@mcp.tool
def get_savings_projection(months: int) -> dict:
    """
    Proyección del ahorro: variación nominal vs rendimiento real
    (ajustado por inflación).
    """
    if months <= 0 or months > 60:
        return {"error": "months debe estar entre 1 y 60"}

    tasa_mensual = TASA_WALLET_ANUAL / 12
    saldo_nominal = SALDO_INICIAL * ((1 + tasa_mensual) ** months)
    factor_inflacion = (1 + INFLACION_MENSUAL_PROYECTADA) ** months
    poder_compra_real = saldo_nominal / factor_inflacion
    variacion_real_pct = ((poder_compra_real / SALDO_INICIAL) - 1) * 100

    return {
        "saldo_inicial": round(SALDO_INICIAL, 2),
        "meses": months,
        "tasa_wallet_tna": f"{TASA_WALLET_ANUAL*100:.1f}%",
        "inflacion_mensual_proyectada": f"{INFLACION_MENSUAL_PROYECTADA*100:.1f}%",
        "saldo_nominal_final": round(saldo_nominal, 2),
        "poder_compra_real_final": round(poder_compra_real, 2),
        "variacion_real_pct": round(variacion_real_pct, 2),
        "veredicto": (
            "✅ Le ganás a la inflación"
            if variacion_real_pct > 0
            else "⚠️ Perdés poder de compra"
        )
    }


@mcp.tool
def get_goal_projection(target_amount: float, target_months: int) -> dict:
    """
    Proyección de una meta de ahorro: cuánto necesitás por mes,
    y qué queda después de gastos.
    """
    if target_amount <= 0 or target_months <= 0 or target_months > 60:
        return {"error": "target_amount y target_months deben ser > 0 (máx 60)"}

    ahorro_mensual_necesario = target_amount / target_months
    tasa_mensual = TASA_WALLET_ANUAL / 12

    saldo_proyectado = SALDO_INICIAL
    for _ in range(target_months):
        saldo_proyectado = (
            saldo_proyectado * (1 + tasa_mensual) + ahorro_mensual_necesario
        )

    factor_inflacion = (1 + INFLACION_MENSUAL_PROYECTADA) ** target_months
    saldo_real = saldo_proyectado / factor_inflacion
    gastos_totales = GASTOS_MENSUALES * target_months
    saldo_final_despues_gastos = saldo_proyectado - gastos_totales

    return {
        "meta": round(target_amount, 2),
        "meses": target_months,
        "ahorro_mensual_necesario": round(ahorro_mensual_necesario, 2),
        "saldo_proyectado_nominal": round(saldo_proyectado, 2),
        "poder_compra_real": round(saldo_real, 2),
        "gastos_totales_periodo": round(gastos_totales, 2),
        "saldo_final_despues_gastos": round(saldo_final_despues_gastos, 2),
        "alcanza_meta": saldo_proyectado >= target_amount,
        "veredicto": (
            f"✅ Alcanzás la meta de ${target_amount:,.0f}"
            if saldo_proyectado >= target_amount
            else f"⚠️ Te faltan ${target_amount - saldo_proyectado:,.0f}"
        )
    }


@mcp.tool
def get_promotions(category: str = "") -> list:
    """
    Lista las promociones activas de la billetera.
    """
    if category:
        return [p for p in PROMOTIONS if p["category"] == category]
    return PROMOTIONS


@mcp.tool
def simulate_goal_with_promo(
    target_amount: float,
    target_months: int,
    promo_id: str,
    monthly_spend_in_promo: float = 30000
) -> dict:
    """
    Simula cuánto ahorrarías si usás una promo durante
    el período de la meta.
    """
    promo = next((p for p in PROMOTIONS if p["id"] == promo_id), None)
    if not promo:
        return {"error": f"Promo '{promo_id}' no encontrada"}

    discount = promo.get("discount_pct", 0)
    if isinstance(discount, str):
        discount = float(discount.split("-")[0].replace("%", ""))

    ahorro_mensual_promo = monthly_spend_in_promo * (discount / 100)

    cap = promo.get("weekly_cap") or promo.get("monthly_cap")
    if cap:
        cap_mensual = cap * 4 if promo.get("weekly_cap") else cap
        ahorro_mensual_promo = min(ahorro_mensual_promo, cap_mensual)

    ahorro_total_promo = ahorro_mensual_promo * target_months

    base = get_goal_projection(target_amount, target_months)
    if "error" in base:
        return base

    saldo_con_promo = base["saldo_proyectado_nominal"] + ahorro_total_promo

    return {
        "promo_usada": promo["description"],
        "ahorro_mensual_estimado": round(ahorro_mensual_promo, 2),
        "ahorro_total_periodo": round(ahorro_total_promo, 2),
        "saldo_sin_promo": base["saldo_proyectado_nominal"],
        "saldo_con_promo": round(saldo_con_promo, 2),
        "meta_alcanzada_antes": base["alcanza_meta"],
        "meta_alcanzada_con_promo": saldo_con_promo >= target_amount,
        "beneficio_extra": round(ahorro_total_promo, 2)
    }


# --- Crédito: score y oferta preaprobada (solo lectura, simulada) ---

# 🛡️ La credencial del usuario llega por header de la conexión MCP, nunca como
# argumento de una tool (pasaría por el LLM).
CREDENTIAL_HEADER = "x-belo-api-key"


def _user_api_key() -> str:
    key = get_http_headers(include={CREDENTIAL_HEADER}).get(CREDENTIAL_HEADER)
    # Solo para demo: usar la credencial del servidor si no viene la del usuario
    if not key and os.getenv("BELO_ALLOW_SERVER_CREDENTIAL") == "true":
        key = os.getenv("BELO_API_KEY")
    if not key:
        raise ToolError("Conectá tu cuenta belo para evaluar tu perfil crediticio.")
    return key


async def _decision(term_months: int | None = None):
    # Modo demo: perfil sintético, sin credencial ni llamadas a belo
    demo_profile = os.getenv("BELO_DEMO_PROFILE")
    if demo_profile:
        try:
            return demo_decision(demo_profile, term_months)
        except ValueError as e:
            raise ToolError(str(e))
    try:
        return await get_decision(_user_api_key(), term_months=term_months)
    except BeloAuthError:
        raise ToolError("Tu cuenta belo no dio acceso a los datos necesarios. Volvé a conectarla.")
    except BeloAPIError:
        raise ToolError("No pudimos leer tus datos de belo en este momento. Probá de nuevo en unos minutos.")


@mcp.tool
async def get_credit_profile() -> dict:
    """
    Perfil crediticio del usuario conectado: score, banda y principales
    razones, calculado sobre sus movimientos en belo. Solo lectura.
    """
    return public_profile(await _decision())


@mcp.tool
async def get_preapproved_offer(term_months: int | None = None) -> dict:
    """
    Oferta de préstamo preaprobado (indicativa y simulada) para el usuario
    conectado: monto máximo en USD, plazo, cuota, TNA/TEA/CFT y vigencia.
    No otorga ni desembolsa nada.
    """
    return public_offer(await _decision(term_months))


@mcp.tool
async def simulate_loan(amount_usd: str, term_months: int) -> dict:
    """
    Tabla de cuotas (sistema francés) para un monto en USD (string decimal,
    ej. "500.00") y un plazo dentro de la oferta preaprobada. No mueve fondos.
    """
    try:
        amount = Decimal(amount_usd)
    except InvalidOperation:
        raise ToolError("amount_usd debe ser un número decimal, por ejemplo \"500.00\".")
    try:
        return public_simulation(await _decision(), amount, term_months)
    except OfferError as e:
        raise ToolError(str(e))


app = mcp.http_app()

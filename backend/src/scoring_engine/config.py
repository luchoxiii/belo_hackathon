"""
Parámetros versionados del scoring y de la oferta.

🛡️ Todos los valores de negocio (tasas, múltiplos, topes) son PLACEHOLDERS
a definir. Cambiar un bin o un peso = nueva versión de la scorecard.
"""

import os
from decimal import Decimal

D = Decimal

SCORECARD_VERSION = "v2-multisource"

BASE_SCORE = 300

# feature -> [(desde incluido, hasta excluido, puntos)]; None = sin límite
SCORECARD_BINS: dict[str, list[tuple[Decimal | None, Decimal | None, int]]] = {
    "recurring_income_ratio": [(None, D("0.3"), 0), (D("0.3"), D("0.6"), 40), (D("0.6"), D("0.8"), 80), (D("0.8"), None, 110)],
    "income_cv": [(None, D("0.3"), 80), (D("0.3"), D("0.6"), 40), (D("0.6"), None, 0)],
    "net_margin": [(None, D(0), 0), (D(0), D("0.1"), 40), (D("0.1"), D("0.25"), 70), (D("0.25"), None, 100)],
    "runway_months": [(None, D(1), 0), (D(1), D(3), 40), (D(3), D(6), 80), (D(6), None, 110)],
    "history_months": [(None, D(3), 0), (D(3), D(6), 20), (D(6), D(12), 50), (D(12), None, 80)],
    "negative_months_share": [(None, D("0.2"), 60), (D("0.2"), D("0.5"), 30), (D("0.5"), None, 0)],
    # v2: más fuentes conectadas
    "income_source_count": [(None, D(2), 0), (D(2), D(3), 20), (D(3), None, 40)],
    "bill_payment_regularity": [(None, D("0.5"), 0), (D("0.5"), D("0.8"), 10), (D("0.8"), None, 20)],
}

ADJUSTMENTS = {
    "has_savings_goal": 20,          # tiene un vault con meta
    "card_coherence_false": -30,     # gasto con tarjeta fuera del rango declarado
    "partial_data": -20,             # 10% < partial_pct <= 30%
    "monotributo_up_to_date": 30,    # v2: Monotributo inscripto y al día
    "monotributo_in_debt": -30,      # v2: Monotributo con cuotas impagas
}
PARTIAL_PENALTY_FROM = D(10)

# Qué mide cada feature/ajuste (para la explicación del score y /api/scoring/methodology)
FEATURE_INFO: dict[str, dict[str, str]] = {
    "recurring_income_ratio": {
        "label": "Ingreso recurrente",
        "description": "Ingreso de pagadores que depositaron en al menos 3 de los últimos 4 meses "
                       "(señal de sueldo), sobre el ingreso total de los últimos 3 meses completos.",
        "unit": "ratio 0-1",
    },
    "income_cv": {
        "label": "Variabilidad del ingreso",
        "description": "Coeficiente de variación del ingreso mensual (desvío / media). Menor = más estable.",
        "unit": "ratio",
    },
    "net_margin": {
        "label": "Margen neto",
        "description": "(Ingresos − egresos) / ingresos en los meses considerados.",
        "unit": "ratio",
    },
    "runway_months": {
        "label": "Colchón de ahorro",
        "description": "(Saldo líquido + vaults) en USD / gasto mensual promedio.",
        "unit": "meses",
    },
    "history_months": {
        "label": "Historial",
        "description": "Meses completos con movimientos (máximo 6 en la ventana).",
        "unit": "meses",
    },
    "negative_months_share": {
        "label": "Meses en rojo",
        "description": "Proporción de meses con más egresos que ingresos.",
        "unit": "ratio 0-1",
    },
    "has_savings_goal": {
        "label": "Meta de ahorro",
        "description": "Tiene al menos un vault con meta (goalAmount).",
        "unit": "bool",
    },
    "card_coherence": {
        "label": "Coherencia del gasto con tarjeta",
        "description": "Compara el gasto mensual promedio con tarjeta (USD) con el rango declarado en "
                       "monthlyCardSpend. 'true' = dentro del rango, 'false' = fuera, 'unknown' = sin rango "
                       "declarado, tarjetas no habilitadas o sin datos.",
        "unit": "true | false | unknown",
    },
    "income_source_count": {
        "label": "Diversidad de fuentes de ingreso",
        "description": "Cantidad de fuentes de datos distintas (belo, Mercado Pago, Uber, OnlyFans...) "
                       "con ingresos en los meses considerados.",
        "unit": "fuentes",
    },
    "bill_payment_regularity": {
        "label": "Pago regular de servicios",
        "description": "Proporción de meses con al menos un pago de servicios (luz, gas, teléfono) "
                       "registrado, por ejemplo en Rapipago o Pago Fácil.",
        "unit": "ratio 0-1",
    },
    "monotributo_status": {
        "label": "Monotributo",
        "description": "Estado en ARCA: 'up_to_date' (inscripto y al día), 'in_debt' (cuotas impagas) "
                       "o 'not_registered' (sin fuente de Monotributo conectada).",
        "unit": "up_to_date | in_debt | not_registered",
    },
    "partial_pct": {
        "label": "Datos incompletos",
        "description": "Porcentaje de movimientos sin comprobante (receipt null) o sin cotización a USD. "
                       "Esos movimientos no suman a ingresos ni egresos.",
        "unit": "%",
    },
}

# Explicaciones en lenguaje simple (sin datos sensibles)
REASON_TEXT = {
    "recurring_income_ratio": "Pocos ingresos recurrentes (tipo sueldo)",
    "income_cv": "Ingresos mensuales muy variables",
    "net_margin": "Gastás una parte alta de lo que ingresa",
    "runway_months": "Poco colchón de ahorro respecto de tus gastos",
    "history_months": "Historial de movimientos corto",
    "negative_months_share": "Varios meses con más egresos que ingresos",
    "card_coherence_false": "El gasto con tarjeta no coincide con lo declarado",
    "partial_data": "Parte de los movimientos no se pudo valorizar",
    "has_savings_goal": "Sin metas de ahorro en vaults",
    "income_source_count": "Ingresos concentrados en pocas fuentes",
    "bill_payment_regularity": "Pocos pagos de servicios registrados",
    "monotributo": "Monotributo no informado o con deuda",
}

REJECTION_TEXT = {
    "insufficient_data": "No pudimos valorizar suficientes movimientos para evaluarte",
    "short_history": "Necesitamos al menos 3 meses de movimientos en tu cuenta",
    "no_income": "No encontramos ingresos en tu cuenta en los últimos meses",
    "manual_review": "Tu solicitud requiere una revisión manual",
}

NO_OFFER_TEXT = {
    "low_score": "Por ahora tu perfil no califica para un préstamo preaprobado",
    "no_payment_capacity": "Tus egresos no dejan margen para una cuota",
    "amount_below_minimum": "El monto que podríamos ofrecerte está por debajo del mínimo",
}

# Bandas: score mínimo (incluido) -> banda. D = sin oferta
BANDS: list[tuple[int, str]] = [(720, "A"), (640, "B"), (560, "C"), (0, "D")]

# Gates de elegibilidad
MAX_PARTIAL_PCT = D(30)
MIN_HISTORY_MONTHS = 3
FEATURE_WINDOW_MONTHS = 6

# Oferta (placeholders): múltiplo de la mediana de ingreso, plazo máximo, TNA en USD
OFFER_BY_BAND: dict[str, dict[str, Decimal | int]] = {
    "A": {"income_multiple": D(3), "max_term": 12, "tna": D("0.18")},
    "B": {"income_multiple": D(2), "max_term": 9, "tna": D("0.24")},
    "C": {"income_multiple": D(1), "max_term": 6, "tna": D("0.32")},
}
MIN_TERM_MONTHS = 3
INSTALLMENT_INCOME_SHARE = D("0.30")      # cuota <= 30% del ingreso recurrente
NON_RECURRING_INCOME_HAIRCUT = D("0.8")   # si no hay recurrente, 80% de la mediana
INSTALLMENT_NET_SHARE = D("0.5")          # cuota <= 50% del neto mensual promedio
OFFER_VALID_DAYS = 7
OFFER_ROUNDING = D(10)                    # montos redondeados hacia abajo a USD 10
MIN_LOAN_USD = D(os.getenv("LOAN_MIN_USD", "50"))
MAX_LOAN_USD = D(os.getenv("LOAN_MAX_USD", "2000"))

DISCLAIMER = (
    "Oferta indicativa y simulada, sujeta a verificación. "
    "No es un compromiso de otorgamiento ni mueve fondos."
)

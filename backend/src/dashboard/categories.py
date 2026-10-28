"""
Mapeo de movimientos categorizados de belo a las categorías del dashboard
(vocabulario de mocks/mock-transactions.json). Reglas por palabra clave en
comercio/contraparte; gana la primera que coincide.
"""

from belo_scoring.models import Category, CategorizedMovement

# (palabras clave en minúscula, categoría) — el orden importa
EXPENSE_KEYWORDS: list[tuple[tuple[str, ...], str]] = [
    (("monotributo",), "monotributo"),
    (("mercado libre",), "compras_online"),
    (("pedidosya", "rappi"), "delivery"),
    (("onlyfans",), "suscripciones"),
    (("jumbo", "carrefour", "coto", "disco", "chango"), "tarjeta_supermercado"),
    (("shell", "ypf", "axion", "puma"), "tarjeta_combustible"),
    (("parrilla", "café", "cafe", "pizzer", "restaurant", "mostaza", "mcdonald", "burger"), "tarjeta_restaurante"),
    (("farmacity", "farmacia"), "tarjeta_farmacia"),
    (("zara", "nike", "adidas", "falabella"), "tarjeta_indumentaria"),
    (("fravega", "garbarino", "musimundo", "apple"), "tarjeta_tecnologia"),
    (("netflix",), "debito_netflix"),
    (("spotify",), "debito_spotify"),
    (("disney", "hbo", "prime video", "paramount"), "debito_streaming"),
    (("megatlon", "sportclub", "gimnasio"), "debito_gimnasio"),
    (("osde", "swiss medical", "galeno", "omint"), "debito_prepaga"),
    (("uber", "cabify", "didi"), "uber_taxi"),
    (("autopista", "peaje", "ausol"), "peaje"),
    (("edenor", "edesur"), "luz"),
    (("metrogas", "naturgy", "camuzzi"), "gas"),
    (("aysa",), "agua"),
    (("fibertel", "telecentro", "movistar fibra"), "internet"),
    (("personal", "claro", "movistar"), "telefono"),
    (("pago con qr", "compra con cuenta dni"), "pago_qr"),
    (("inmobiliaria", "alquiler"), "alquiler"),
    (("consorcio", "expensas"), "expensas"),
    (("colegio", "escuela"), "cuota_colegio"),
    (("seguro",), "seguro_auto"),
    (("afip", "arca", "ganancias"), "impuesto_ganancias"),
]

INCOME_KEYWORDS: list[tuple[tuple[str, ...], str]] = [
    (("freelance", "honorarios"), "freelance"),
    (("venta",), "ventas"),
    (("reembolso", "reintegro"), "reembolso"),
    (("aguinaldo",), "aguinaldo"),
]

# Sin coincidencia: categorías genéricas (no están en el mock)
FALLBACK = {
    ("expense", "card"): "tarjeta_otros",
    ("expense", "bill"): "servicios",
    ("expense", "tax"): "impuestos",
    ("expense", "platform_purchase"): "compras_plataforma",
    ("expense", "pix"): "pix_enviado",
    ("expense", "crypto_withdrawal"): "retiro_crypto",
    ("expense", None): "transferencia_enviada",
    ("income", "crypto_deposit"): "deposito_crypto",
    ("income", None): "transferencia_recibida",
}


def _match(text: str, rules: list[tuple[tuple[str, ...], str]]) -> str | None:
    text = text.lower()
    return next((category for keywords, category in rules if any(k in text for k in keywords)), None)


def dashboard_category(m: CategorizedMovement, salary_payers: set[str]) -> str | None:
    """Categoría del dashboard, o None si el movimiento no se muestra (internos, excluidos)."""
    text = " ".join(filter(None, (m.description, m.counterparty_name, m.counterparty_key)))
    if m.category == Category.INCOME:
        if m.subcategory == "platform":
            return "ingreso_plataforma"
        if m.subcategory == "card_refund":
            return "reembolso"
        keyword = _match(text, INCOME_KEYWORDS)
        if keyword:
            return keyword
        if m.counterparty_key and m.counterparty_key in salary_payers:
            return "salario"
        return FALLBACK.get(("income", m.subcategory)) or FALLBACK[("income", None)]
    if m.category == Category.EXPENSE:
        return _match(text, EXPENSE_KEYWORDS) or FALLBACK.get(("expense", m.subcategory)) or FALLBACK[("expense", None)]
    if m.category == Category.INTERNAL and m.subcategory == "conversion":
        return "compra_crypto" if m.swap_direction == "BUY" else "venta_crypto"
    # Transferencias a cuentas propias y excluidos (pending/failed) no se muestran
    return None


# Fuentes cuya tarjeta es de crédito (el resto debita del saldo)
CREDIT_CARD_PROVIDERS = {"naranja_x"}


def dashboard_method(m: CategorizedMovement) -> str:
    """Medio de pago en el vocabulario del mock (+ `efectivo`)."""
    if m.source == "card":
        return "tarjeta_credito" if m.provider in CREDIT_CARD_PROVIDERS else "tarjeta_debito"
    if m.subcategory == "bill":
        return "efectivo"
    if m.subcategory in ("conversion", "crypto_deposit", "crypto_withdrawal"):
        return "crypto"
    return "transferencia"

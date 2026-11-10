"""
Descarga de cotizaciones históricas ARS/USD (I/O).

Fuente: argentinadatos (pública, sin auth). `casa` = oficial | bolsa (MEP) | blue...,
configurable con BELO_FX_ARS_CASA. Se usa el promedio compra/venta.
BRL no tiene fuente todavía: queda sin normalizar.
"""

import json
import os
from datetime import date
from decimal import Decimal

import httpx

ARGENTINADATOS_URL = "https://api.argentinadatos.com/v1/cotizaciones/dolares/{casa}"
DEFAULT_CASA = "oficial"


async def fetch_ars_rates(start: date, end: date, timeout: float = 10) -> dict[str, str]:
    """`{"YYYY-MM-DD": "ARS por 1 USD"}` entre `start` y `end` (incluidos)."""
    casa = os.getenv("BELO_FX_ARS_CASA", DEFAULT_CASA)
    async with httpx.AsyncClient(timeout=timeout) as http:
        response = await http.get(ARGENTINADATOS_URL.format(casa=casa))
        response.raise_for_status()
    # parse_float=Decimal: la fuente manda números JSON, nunca pasan por float
    rows = json.loads(response.text, parse_float=Decimal, parse_int=Decimal)
    rates: dict[str, str] = {}
    for row in rows:
        day = row.get("fecha")
        if not day or not (start.isoformat() <= day <= end.isoformat()):
            continue
        buy, sell = row.get("compra"), row.get("venta")
        if buy and sell:
            rates[day] = str((buy + sell) / 2)
    return rates

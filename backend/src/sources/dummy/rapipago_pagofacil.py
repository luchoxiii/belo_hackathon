"""Rapipago / Pago Fácil: pago de servicios en efectivo."""

from ..models import Direction, MovementKind
from .base import DummyContext, DummyRepository

# (empresa, rango ARS, día de vencimiento)
BILLS = [("Edenor", (25000, 55000), 12), ("Metrogas", (15000, 40000), 15), ("Claro", (18000, 30000), 18)]


class RapipagoPagoFacilRepository(DummyRepository):
    id = "rapipago_pagofacil"
    name = "Rapipago / Pago Fácil"

    def generate(self, ctx: DummyContext) -> None:
        for month in ctx.months():
            for company, (low, high), due in BILLS:
                # Casi siempre se paga; a veces se saltea un mes
                if ctx.rng.random() < 0.9:
                    channel = ctx.rng.choice(["Rapipago", "Pago Fácil"])
                    ctx.add(MovementKind.BILL, Direction.OUT, month, due, ctx.ars(low, high), company,
                            rail="CASH", description=f"{company} ({channel})")

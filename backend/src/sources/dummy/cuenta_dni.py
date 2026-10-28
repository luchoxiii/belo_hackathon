"""Cuenta DNI (Banco Provincia): compras con QR en ferias y comercios, y reintegros de las promos."""

from decimal import ROUND_DOWN, Decimal

from ..models import Direction, MovementKind
from .base import DummyContext, DummyRepository

STORES = ["Feria Bonaerense", "Carnicería Los Hermanos", "Chango Más"]


class CuentaDniRepository(DummyRepository):
    id = "cuenta_dni"
    name = "Cuenta DNI"

    def generate(self, ctx: DummyContext) -> None:
        for month in ctx.months():
            spent = Decimal(0)
            for _ in range(ctx.rng.randint(2, 5)):
                amount = ctx.ars(5000, 30000)
                spent += amount
                ctx.add(MovementKind.TRANSFER, Direction.OUT, month, ctx.day(), amount,
                        ctx.rng.choice(STORES), rail="QR", description="Compra con Cuenta DNI")
            # Reintegro del 20% con tope, acreditado a fin de mes
            refund = min(spent * Decimal("0.2"), Decimal(12000)).quantize(Decimal(1), rounding=ROUND_DOWN)
            ctx.add(MovementKind.TRANSFER, Direction.IN, month, 28, refund, "Banco Provincia",
                    rail="CVU", description="Reintegro Cuenta DNI")

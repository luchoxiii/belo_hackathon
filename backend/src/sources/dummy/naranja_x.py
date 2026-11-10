"""Naranja X: consumos con tarjeta de crédito (algunos en cuotas)."""

from ..models import Direction, MovementKind
from .base import DummyContext, DummyRepository

MERCHANTS = ["FRAVEGA", "GARBARINO", "NIKE", "JUMBO", "YPF"]


class NaranjaXRepository(DummyRepository):
    id = "naranja_x"
    name = "Naranja X"

    def generate(self, ctx: DummyContext) -> None:
        for month in ctx.months():
            for _ in range(ctx.rng.randint(2, 5)):
                merchant = ctx.rng.choice(MERCHANTS)
                installments = ctx.rng.choice([1, 1, 3, 6])
                description = merchant if installments == 1 else f"{merchant} cuota 1/{installments}"
                ctx.add(MovementKind.CARD, Direction.OUT, month, ctx.day(), ctx.ars(8000, 90000),
                        merchant, rail="CARD", description=description,
                        card_last4="1234", card_brand="naranja")

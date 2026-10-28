"""OnlyFans: liquidaciones quincenales al creador (USD) y suscripciones pagadas (USD)."""

from ..models import Direction, MovementKind
from .base import DummyContext, DummyRepository


class OnlyFansRepository(DummyRepository):
    id = "onlyfans"
    name = "OnlyFans"

    def generate(self, ctx: DummyContext) -> None:
        for month in ctx.months():
            for day in (1, 15):
                ctx.add(MovementKind.PAYOUT, Direction.IN, month, day, ctx.usd(80, 400), "OnlyFans",
                        currency="USD", rail="PLATFORM", description="Liquidación OnlyFans")
            ctx.add(MovementKind.PURCHASE, Direction.OUT, month, ctx.day(), ctx.usd(5, 15), "OnlyFans",
                    currency="USD", rail="PLATFORM", description="Suscripción OnlyFans")

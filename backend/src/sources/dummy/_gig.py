"""Base de plataformas de viajes/delivery: liquidaciones semanales y consumos en la app."""

from ..models import Direction, MovementKind
from .base import DummyContext, DummyRepository


class GigPlatformRepository(DummyRepository):
    payout_range: tuple[int, int]     # ARS por semana trabajada
    purchase_range: tuple[int, int]   # ARS por pedido/viaje
    purchases_per_month: tuple[int, int]
    payout_label: str
    purchase_label: str

    def generate(self, ctx: DummyContext) -> None:
        for month in ctx.months():
            for day in (7, 14, 21, 28):
                # No todas las semanas se trabaja
                if ctx.rng.random() < 0.75:
                    ctx.add(MovementKind.PAYOUT, Direction.IN, month, day, ctx.ars(*self.payout_range),
                            self.name, rail="PLATFORM", description=self.payout_label)
            for _ in range(ctx.rng.randint(*self.purchases_per_month)):
                ctx.add(MovementKind.PURCHASE, Direction.OUT, month, ctx.day(), ctx.ars(*self.purchase_range),
                        self.name, rail="PLATFORM", description=self.purchase_label)

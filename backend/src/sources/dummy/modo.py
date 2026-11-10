"""MODO: transferencias P2P con amigos (entran y salen) y pagos con QR en comercios."""

from ..models import Direction, MovementKind
from .base import DummyContext, DummyRepository

FRIENDS = ["Juan Pérez", "Sofía Gómez", "Nico Fernández", "Caro López", "Mati Ruiz"]
BARS = ["Bar La Esquina", "Cervecería Antares", "Heladería Freddo"]


class ModoRepository(DummyRepository):
    id = "modo"
    name = "MODO"

    def generate(self, ctx: DummyContext) -> None:
        for month in ctx.months():
            for _ in range(ctx.rng.randint(1, 4)):
                ctx.add(MovementKind.TRANSFER, Direction.IN, month, ctx.day(), ctx.ars(3000, 40000),
                        ctx.rng.choice(FRIENDS), rail="CVU", description="Transferencia recibida")
            for _ in range(ctx.rng.randint(1, 4)):
                ctx.add(MovementKind.TRANSFER, Direction.OUT, month, ctx.day(), ctx.ars(3000, 35000),
                        ctx.rng.choice(FRIENDS), rail="CVU", description="Transferencia enviada")
            for _ in range(ctx.rng.randint(1, 3)):
                ctx.add(MovementKind.TRANSFER, Direction.OUT, month, ctx.day(), ctx.ars(6000, 30000),
                        ctx.rng.choice(BARS), rail="QR", description="Pago con QR")

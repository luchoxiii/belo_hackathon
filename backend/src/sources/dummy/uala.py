"""Ualá: consumos con tarjeta prepaga, fondeo mensual a Mercado Pago (cuenta propia) y saldo con rendimiento."""

from decimal import Decimal

from ..models import Direction, MovementKind
from .base import DummyContext, DummyRepository, own_key

MERCHANTS = ["COTO", "DIA", "FARMACITY", "STEAM", "ZARA"]


class UalaRepository(DummyRepository):
    id = "uala"
    name = "Ualá"

    def generate(self, ctx: DummyContext) -> None:
        mp = own_key("mercado_pago", ctx.subject_id)
        ctx.own_accounts.add(mp)
        for month in ctx.months():
            for _ in range(ctx.rng.randint(3, 7)):
                ctx.add(MovementKind.CARD, Direction.OUT, month, ctx.day(), ctx.ars(4000, 55000),
                        ctx.rng.choice(MERCHANTS), rail="CARD", card_last4="7788", card_brand="mastercard")
            ctx.add(MovementKind.TRANSFER, Direction.OUT, month, 3, Decimal(150000), "Mercado Pago (cuenta propia)",
                    rail="CVU", counterparty_key=mp, description="Envío a Mercado Pago")
        ctx.wallet("Ualá", ctx.ars(20000, 250000), rate="31.00%", earned_month=ctx.ars(500, 4000))

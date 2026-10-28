"""Mercado Pago: ventas cobradas con QR/link, pagos con QR, compras en Mercado Libre, fondeo desde Ualá."""

from decimal import Decimal

from ..models import Direction, MovementKind
from .base import DummyContext, DummyRepository, own_key

STORES = ["Kiosco El Sol", "Verdulería Don Pepe", "Panadería La Espiga", "Café del Centro"]


class MercadoPagoRepository(DummyRepository):
    id = "mercado_pago"
    name = "Mercado Pago"

    def generate(self, ctx: DummyContext) -> None:
        # Recibe el fondeo mensual que sale de Ualá (cuenta propia)
        ctx.own_accounts.add(own_key("uala", ctx.subject_id))
        for month in ctx.months():
            for i in range(ctx.rng.randint(3, 8)):
                ctx.add(MovementKind.TRANSFER, Direction.IN, month, ctx.day(), ctx.ars(8000, 60000),
                        f"Cliente {ctx.rng.randint(1, 40)}", rail="QR", description="Venta cobrada con QR")
            for _ in range(ctx.rng.randint(3, 6)):
                ctx.add(MovementKind.TRANSFER, Direction.OUT, month, ctx.day(), ctx.ars(1500, 15000),
                        ctx.rng.choice(STORES), rail="QR", description="Pago con QR")
            for _ in range(ctx.rng.randint(0, 2)):
                ctx.add(MovementKind.PURCHASE, Direction.OUT, month, ctx.day(), ctx.ars(15000, 120000),
                        "Mercado Libre", rail="PLATFORM", description="Compra en Mercado Libre")
            ctx.add(MovementKind.TRANSFER, Direction.IN, month, 3, Decimal(150000), "Ualá (cuenta propia)",
                    rail="CVU", counterparty_key=own_key("uala", ctx.subject_id), description="Ingreso desde Ualá")
        ctx.wallet("Mercado Pago", ctx.ars(40000, 400000), rate="33.00%", earned_month=ctx.ars(800, 6000))

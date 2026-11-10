"""Rappi: liquidaciones semanales como repartidor y pedidos como cliente."""

from ._gig import GigPlatformRepository


class RappiRepository(GigPlatformRepository):
    id = "rappi"
    name = "Rappi"
    payout_range = (35000, 120000)
    purchase_range = (7000, 28000)
    purchases_per_month = (1, 5)
    payout_label = "Liquidación semanal Rappi"
    purchase_label = "Pedido en Rappi"

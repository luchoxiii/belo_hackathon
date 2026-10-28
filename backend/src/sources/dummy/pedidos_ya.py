"""PedidosYa: liquidaciones semanales como repartidor y pedidos como cliente."""

from ._gig import GigPlatformRepository


class PedidosYaRepository(GigPlatformRepository):
    id = "pedidos_ya"
    name = "PedidosYa"
    payout_range = (40000, 130000)
    purchase_range = (8000, 30000)
    purchases_per_month = (2, 7)
    payout_label = "Liquidación semanal PedidosYa"
    purchase_label = "Pedido en PedidosYa"

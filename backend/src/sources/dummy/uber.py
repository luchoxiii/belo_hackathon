"""Uber: liquidaciones semanales como conductor y viajes como pasajero."""

from ._gig import GigPlatformRepository


class UberRepository(GigPlatformRepository):
    id = "uber"
    name = "Uber"
    payout_range = (60000, 180000)
    purchase_range = (3000, 12000)
    purchases_per_month = (1, 5)
    payout_label = "Liquidación semanal Uber"
    purchase_label = "Viaje en Uber"

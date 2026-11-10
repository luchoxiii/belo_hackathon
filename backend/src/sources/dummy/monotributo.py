"""Monotributo (ARCA): categoría, estado de pagos y cuota mensual."""

from decimal import Decimal

from ..models import Direction, MovementKind
from .base import DummyContext, DummyRepository

# Categoría -> (cuota mensual ARS, facturación anual máxima ARS) — valores ilustrativos
CATEGORIES = {
    "A": (37000, 8_000_000), "B": (42000, 12_000_000), "C": (49000, 17_000_000),
    "D": (63000, 22_000_000), "E": (80000, 26_000_000), "F": (98000, 33_000_000),
}


class MonotributoRepository(DummyRepository):
    id = "monotributo"
    name = "Monotributo (ARCA)"

    def generate(self, ctx: DummyContext) -> None:
        category = ctx.rng.choice(list(CATEGORIES))
        fee, max_revenue = CATEGORIES[category]
        up_to_date = ctx.rng.random() < 0.75
        months = ctx.months()
        # Con deuda: no pagó los últimos 2 meses
        paid = months if up_to_date else months[:-2]
        for month in paid:
            ctx.add(MovementKind.TAX, Direction.OUT, month, 20, Decimal(fee), "ARCA",
                    rail="CVU", description=f"Monotributo categoría {category}")
        ctx.facts.update({
            "registered": True,
            "category": category,
            "up_to_date": up_to_date,
            "monthly_fee_ars": str(fee),
            "max_annual_revenue_ars": str(max_revenue),
            "unpaid_months": 0 if up_to_date else 2,
        })

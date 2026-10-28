"""Contrato del patrón repository y combinación de fuentes en un perfil."""

from datetime import datetime
from typing import Protocol

from .models import ProfileData, SourceData, SourceInfo


class SourceRepository(Protocol):
    id: str      # "mercado_pago"
    name: str    # "Mercado Pago"
    live: bool   # False = dummy

    async def fetch(self, subject_id: str, window_from: datetime, window_to: datetime) -> SourceData:
        """Movimientos, saldos y datos del usuario en la ventana. Solo lectura."""
        ...


def merge(parts: list[tuple[SourceInfo, SourceData]], fetched_at: datetime,
          window_from: datetime, window_to: datetime) -> ProfileData:
    profile = ProfileData(fetched_at=fetched_at, window_from=window_from, window_to=window_to)
    for info, data in parts:
        profile.sources.append(info)
        profile.movements.extend(data.movements)
        profile.balances.extend(data.balances)
        profile.own_accounts |= {k.lower() for k in data.own_accounts}
        if data.facts:
            profile.facts[data.source] = data.facts
        for currency, by_day in data.fx_rates.items():
            profile.fx_rates.setdefault(currency, {}).update(by_day)
        profile.declared_brackets.update({k: v for k, v in data.declared_brackets.items() if v})
        profile.card_application_status = profile.card_application_status or data.card_application_status
        profile.unavailable.update({f"{data.source}:{k}": v for k, v in data.unavailable.items()})
    profile.movements.sort(key=lambda m: m.occurred_at, reverse=True)
    return profile

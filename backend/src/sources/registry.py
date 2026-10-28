"""
Registro de fuentes y carga del perfil combinado de un usuario.

Para agregar una fuente: implementar `SourceRepository` (o heredar de
`DummyRepository`) y sumarla a `DUMMY_SOURCES`.

Qué fuentes dummy se conectan para un usuario:
1. Las que el usuario conectó/desconectó (`ConnectionStore`, endpoints /api/sources).
2. Si nunca configuró, el default: `DUMMY_SOURCES` (env: "all", "none" o lista),
   o las de `DEMO_SOURCES[perfil]` en un perfil demo, o todas para usuarios reales.
"""

import os

from belo_scoring.models import RawData

from .base import SourceRepository, merge
from .belo import BeloRepository, belo_source_data, source_info
from .connections import ConnectionStore, JsonFileConnectionStore
from .dummy import (
    CuentaDniRepository,
    MercadoPagoRepository,
    ModoRepository,
    MonotributoRepository,
    NaranjaXRepository,
    OnlyFansRepository,
    PedidosYaRepository,
    RapipagoPagoFacilRepository,
    RappiRepository,
    UalaRepository,
    UberRepository,
)
from .models import ProfileData, SourceInfo

DUMMY_SOURCES: dict[str, SourceRepository] = {
    repo.id: repo for repo in (
        MercadoPagoRepository(), ModoRepository(), UalaRepository(), NaranjaXRepository(),
        OnlyFansRepository(), CuentaDniRepository(), UberRepository(), PedidosYaRepository(),
        RappiRepository(), RapipagoPagoFacilRepository(), MonotributoRepository(),
    )
}

# Fuentes dummy por perfil demo (salaried y short_history quedan solo con belo)
DEMO_SOURCES: dict[str, list[str]] = {
    "salaried": [],
    "short_history": [],
    "erratic": ["uber", "pedidos_ya", "rappi", "onlyfans", "mercado_pago"],
    "family": ["mercado_pago", "modo", "uala", "naranja_x", "cuenta_dni", "rapipago_pagofacil", "monotributo"],
}


def catalog() -> list[SourceInfo]:
    """Todas las fuentes disponibles."""
    return [SourceInfo(id="belo", name="belo", live=True)] + [
        SourceInfo(id=r.id, name=r.name, live=r.live) for r in DUMMY_SOURCES.values()
    ]


class UnknownSourceError(ValueError):
    pass


class LiveSourceError(ValueError):
    """belo es la fuente real del usuario: no se desconecta."""


_store: ConnectionStore | None = None


def get_store() -> ConnectionStore:
    global _store
    if _store is None:
        _store = JsonFileConnectionStore()
    return _store


def set_store(store: ConnectionStore | None) -> None:
    """Para tests o para cambiar el backend de persistencia."""
    global _store
    _store = store


def connected_source_ids(subject_id: str, demo_profile: str | None = None) -> list[str]:
    """Fuentes dummy conectadas del usuario (en el orden del registro)."""
    saved = get_store().get(subject_id)
    chosen = set(saved) if saved is not None else set(dummy_source_ids(demo_profile))
    return [s for s in DUMMY_SOURCES if s in chosen]


def set_connected(subject_id: str, source_id: str, connected: bool, demo_profile: str | None = None) -> list[str]:
    """Conecta o desconecta una fuente dummy y devuelve las conectadas."""
    if source_id == "belo":
        raise LiveSourceError("belo es la fuente principal y no se puede desconectar.")
    if source_id not in DUMMY_SOURCES:
        raise UnknownSourceError(f"Fuente desconocida '{source_id}'. Opciones: {', '.join(DUMMY_SOURCES)}")
    current = set(connected_source_ids(subject_id, demo_profile))
    current = current | {source_id} if connected else current - {source_id}
    ordered = [s for s in DUMMY_SOURCES if s in current]
    get_store().set(subject_id, ordered)
    return ordered


def dummy_source_ids(demo_profile: str | None = None) -> list[str]:
    """Default de fuentes dummy (cuando el usuario nunca configuró las suyas)."""
    configured = os.getenv("DUMMY_SOURCES")
    if configured is not None and configured.strip():
        value = configured.strip().lower()
        if value == "all":
            return list(DUMMY_SOURCES)
        if value == "none":
            return []
        ids = [s.strip() for s in value.split(",") if s.strip()]
        unknown = [s for s in ids if s not in DUMMY_SOURCES]
        if unknown:
            raise ValueError(f"Fuentes desconocidas en DUMMY_SOURCES: {', '.join(unknown)}. "
                             f"Opciones: {', '.join(DUMMY_SOURCES)}")
        return ids
    if demo_profile is not None:
        return DEMO_SOURCES.get(demo_profile, [])
    return list(DUMMY_SOURCES)


async def load_profile(subject_id: str, belo: BeloRepository, dummy_ids: list[str]) -> ProfileData:
    """belo define la ventana; las fuentes dummy generan datos para esa misma ventana."""
    belo_data = await belo.fetch(subject_id, None, None)  # el loader de belo ya trae su ventana
    raw = belo.raw
    parts = [(source_info(raw), belo_data)]
    for source_id in dummy_ids:
        repo = DUMMY_SOURCES[source_id]
        data = await repo.fetch(subject_id, raw.window_from, raw.window_to)
        parts.append((SourceInfo(id=repo.id, name=repo.name, live=repo.live), data))
    return merge(parts, raw.fetched_at, raw.window_from, raw.window_to)


def profile_from_raw(raw: RawData, subject_id: str, dummy_ids: list[str]) -> ProfileData:
    """Versión síncrona de `load_profile` cuando el RawData de belo ya está en memoria (demo, --from-raw)."""
    parts = [(source_info(raw), belo_source_data(raw))]
    for source_id in dummy_ids:
        repo = DUMMY_SOURCES[source_id]
        parts.append((SourceInfo(id=repo.id, name=repo.name, live=repo.live),
                      repo.build(subject_id, raw.window_from, raw.window_to)))
    return merge(parts, raw.fetched_at, raw.window_from, raw.window_to)


def source_name(source_id: str) -> str:
    if source_id == "belo":
        return "belo"
    repo = DUMMY_SOURCES.get(source_id)
    return repo.name if repo else source_id

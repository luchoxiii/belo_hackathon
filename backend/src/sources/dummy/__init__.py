"""Fuentes dummy: un módulo por fuente, todas sobre `DummyRepository`."""

from .base import DummyContext, DummyRepository, own_key
from .cuenta_dni import CuentaDniRepository
from .mercado_pago import MercadoPagoRepository
from .modo import ModoRepository
from .monotributo import MonotributoRepository
from .naranja_x import NaranjaXRepository
from .onlyfans import OnlyFansRepository
from .pedidos_ya import PedidosYaRepository
from .rapipago_pagofacil import RapipagoPagoFacilRepository
from .rappi import RappiRepository
from .uala import UalaRepository
from .uber import UberRepository

__all__ = [
    "CuentaDniRepository", "DummyContext", "DummyRepository", "MercadoPagoRepository", "ModoRepository",
    "MonotributoRepository", "NaranjaXRepository", "OnlyFansRepository", "PedidosYaRepository",
    "RapipagoPagoFacilRepository", "RappiRepository", "UalaRepository", "UberRepository", "own_key",
]

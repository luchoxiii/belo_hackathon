"""
Recolección y categorización de datos de belo para el motor de scoring.

100% read-only. Sin dependencia de FastMCP: las funciones se envuelven en tools
más adelante, cuando el motor de scoring esté estable.
"""

from .aggregate import aggregate_monthly
from .categorize import categorize
from .fetch import fetch_raw, load_raw, save_raw
from .fx import FxProvider, StubFxProvider
from .models import (
    CategorizedMovement,
    Category,
    DeclaredProfile,
    MonthlyAggregates,
    RawData,
    SavingsSnapshot,
)
from .snapshot import build_declared_profile, build_savings_snapshot

__all__ = [
    "Category",
    "CategorizedMovement",
    "DeclaredProfile",
    "FxProvider",
    "MonthlyAggregates",
    "RawData",
    "SavingsSnapshot",
    "StubFxProvider",
    "aggregate_monthly",
    "build_declared_profile",
    "build_savings_snapshot",
    "categorize",
    "fetch_raw",
    "load_raw",
    "save_raw",
]

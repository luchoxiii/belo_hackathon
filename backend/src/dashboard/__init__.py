"""
Datos para el dashboard (panel de gastos), con la forma de backend/mocks/.

Lógica pura sobre RawData: sirve igual para el perfil demo y para un usuario real.
"""

from .transactions import build_transactions_payload

__all__ = ["build_transactions_payload"]

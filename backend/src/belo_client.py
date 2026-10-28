"""
Cliente read-only para la API REST de belo.

- Auth: header `Authorization: ApiKey belo_live_<key>`, la key viene de BELO_API_KEY.
- Solo GET sobre endpoints registrados en ENDPOINTS (whitelist).
- La key nunca se loguea ni se devuelve en errores.

Para sumar un endpoint, agregalo a ENDPOINTS y usá `get("nombre", ...)`.
"""

import os
from typing import Any

import httpx

BELO_API_BASE_URL = os.getenv("BELO_API_BASE_URL", "").rstrip("/")
BELO_API_TIMEOUT = float(os.getenv("BELO_API_TIMEOUT", "5"))

# 🛡️ Whitelist de endpoints: nombre lógico -> path (admite placeholders {param})
# Los paths son relativos a BELO_API_BASE_URL (que ya incluye /api/v1)
ENDPOINTS: dict[str, str] = {
    "balances": "/account/balances",
    "deposit_addresses": "/account/deposit-addresses",
}


class BeloAPIError(Exception):
    """Error al consultar la API de belo (sin datos sensibles en el mensaje)."""

    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


def _api_key() -> str:
    key = os.getenv("BELO_API_KEY", "")
    if not key:
        raise BeloAPIError("BELO_API_KEY no está configurada")
    if not key.startswith("belo_"):
        raise BeloAPIError("BELO_API_KEY tiene un formato inválido")
    return key


_client: httpx.Client | None = None


def _get_client() -> httpx.Client:
    # Cliente reutilizable entre invocaciones de la misma función serverless
    global _client
    if _client is None:
        if not BELO_API_BASE_URL:
            raise BeloAPIError("BELO_API_BASE_URL no está configurada")
        _client = httpx.Client(
            base_url=BELO_API_BASE_URL,
            timeout=BELO_API_TIMEOUT,
            headers={"Accept": "application/json"},
        )
    return _client


def get(endpoint: str, params: dict[str, Any] | None = None, **path_params: Any) -> Any:
    """
    GET a un endpoint de la whitelist.

    `path_params` completa los placeholders del path; `params` va como query string.
    """
    if endpoint not in ENDPOINTS:
        raise BeloAPIError(f"Endpoint '{endpoint}' no está habilitado")

    try:
        path = ENDPOINTS[endpoint].format(**path_params)
    except KeyError as e:
        raise BeloAPIError(f"Falta el parámetro {e} para '{endpoint}'")

    try:
        response = _get_client().get(
            path,
            params=params,
            headers={"Authorization": f"ApiKey {_api_key()}"},
        )
    except httpx.TimeoutException:
        raise BeloAPIError(f"Timeout consultando '{endpoint}'")
    except httpx.HTTPError:
        raise BeloAPIError(f"Error de conexión consultando '{endpoint}'")

    if response.status_code >= 400:
        raise BeloAPIError(
            f"belo respondió {response.status_code} en '{endpoint}'",
            status_code=response.status_code,
        )

    return response.json()


def get_balances() -> list[dict]:
    """
    Saldos de la cuenta por moneda.

    Los montos (`available`, `earned.*`) son strings decimales: no convertir a float.
    """
    return get("balances").get("data", [])


def get_deposit_addresses() -> list[dict]:
    """
    Direcciones de depósito por moneda y red: `{currencyCode, network, value}`.

    🛡️ Incluye CVU y alias (network "cvu"/"alias"): no exponer al LLM ni loguear.
    """
    return get("deposit_addresses").get("data", [])

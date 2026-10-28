"""
Cliente read-only async para la API REST de belo.

- Auth: header `Authorization: ApiKey belo_live_<key>`, la key viene de BELO_API_KEY.
- Base URL: BELO_BASE_URL (host) o BELO_API_BASE_URL; `/api/v1` se agrega si falta.
- Solo GET sobre endpoints registrados en ENDPOINTS (whitelist).
- La key nunca se loguea ni se devuelve en errores.

🛡️ Nunca agregar POST/PUT/DELETE. Los "preview" de swaps, transfers y pix
crean una transacción pendiente en el ledger.

Para sumar un endpoint, agregalo a ENDPOINTS y usá `client.get("nombre", ...)`.
"""

import asyncio
import os
import time
from collections.abc import Awaitable, Callable
from typing import Any

import httpx

# 🛡️ Whitelist de endpoints: nombre lógico -> path relativo a /api/v1
ENDPOINTS: dict[str, str] = {
    "balances": "/account/balances",
    "deposit_addresses": "/account/deposit-addresses",
    "transactions": "/transactions",
    "contacts": "/contacts",
    "cards": "/cards",
    "card_transactions": "/cards/{card_id}/transactions",
    "card_application": "/cards/application",
    "vaults": "/vaults",
    "vault": "/vaults/{vault_id}",
}

# Rate limit de belo: 1 req/s por organización
RATE_LIMITED = {"vaults", "vault"}
RATE_LIMIT_INTERVAL = 1.0

PAGE_LIMIT = 100
MAX_RETRIES = 3
RETRYABLE_STATUS = {429, 500, 502}


class BeloAPIError(Exception):
    """Error al consultar la API de belo (sin datos sensibles en el mensaje)."""

    def __init__(self, message: str, status_code: int | None = None, code: str | None = None):
        super().__init__(message)
        self.status_code = status_code
        self.code = code


class BeloAuthError(BeloAPIError):
    """401: la credencial no cubre la operación. No se reintenta."""


def _base_url() -> str:
    url = (os.getenv("BELO_BASE_URL") or os.getenv("BELO_API_BASE_URL") or "").rstrip("/")
    if not url:
        raise BeloAPIError("BELO_BASE_URL no está configurada")
    if not url.endswith("/api/v1"):
        url += "/api/v1"
    return url


def _api_key() -> str:
    key = os.getenv("BELO_API_KEY", "")
    if not key:
        raise BeloAPIError("BELO_API_KEY no está configurada")
    if not key.startswith("belo_"):
        raise BeloAPIError("BELO_API_KEY tiene un formato inválido")
    return key


def _error_code(response: httpx.Response) -> str | None:
    # Ramificar por `code`, nunca por `message`
    try:
        return response.json()["error"]["code"]
    except Exception:
        return None


def _retry_after(response: httpx.Response) -> float:
    try:
        return max(float(response.headers.get("Retry-After", "1")), 0)
    except ValueError:
        return 1.0


class BeloClient:
    """
    Cliente async. Usar como context manager:

        async with BeloClient() as belo:
            balances = await belo.get_balances()
    """

    def __init__(
        self,
        base_url: str | None = None,
        api_key: str | None = None,
        timeout: float | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    ):
        self._http = httpx.AsyncClient(
            base_url=base_url or _base_url(),
            timeout=timeout or float(os.getenv("BELO_API_TIMEOUT", "5")),
            headers={
                "Accept": "application/json",
                "Authorization": f"ApiKey {api_key or _api_key()}",
            },
            transport=transport,
        )
        self._sleep = sleep
        self._rate_lock = asyncio.Lock()
        self._last_rate_limited_call = 0.0

    async def __aenter__(self) -> "BeloClient":
        return self

    async def __aexit__(self, *exc: Any) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        await self._http.aclose()

    async def get(self, endpoint: str, params: dict[str, Any] | None = None, **path_params: Any) -> Any:
        """
        GET a un endpoint de la whitelist, con reintentos en 429/500/502.

        `path_params` completa los placeholders del path; `params` va como query string.
        """
        if endpoint not in ENDPOINTS:
            raise BeloAPIError(f"Endpoint '{endpoint}' no está habilitado")
        try:
            path = ENDPOINTS[endpoint].format(**path_params)
        except KeyError as e:
            raise BeloAPIError(f"Falta el parámetro {e} para '{endpoint}'")

        if endpoint in RATE_LIMITED:
            async with self._rate_lock:
                wait = RATE_LIMIT_INTERVAL - (time.monotonic() - self._last_rate_limited_call)
                if wait > 0:
                    await self._sleep(wait)
                try:
                    return await self._get_with_retries(endpoint, path, params)
                finally:
                    self._last_rate_limited_call = time.monotonic()
        return await self._get_with_retries(endpoint, path, params)

    async def _get_with_retries(self, endpoint: str, path: str, params: dict[str, Any] | None) -> Any:
        for attempt in range(MAX_RETRIES + 1):
            last_attempt = attempt == MAX_RETRIES
            try:
                response = await self._http.get(path, params=params)
            except httpx.TimeoutException:
                if last_attempt:
                    raise BeloAPIError(f"Timeout consultando '{endpoint}'")
                await self._sleep(0.5 * 2**attempt)
                continue
            except httpx.HTTPError:
                if last_attempt:
                    raise BeloAPIError(f"Error de conexión consultando '{endpoint}'")
                await self._sleep(0.5 * 2**attempt)
                continue

            if response.status_code < 400:
                return response.json()

            code = _error_code(response)
            if response.status_code == 401:
                raise BeloAuthError(
                    f"La credencial no tiene acceso a '{endpoint}'",
                    status_code=401,
                    code=code,
                )
            if response.status_code in RETRYABLE_STATUS and not last_attempt:
                if response.status_code == 429:
                    await self._sleep(_retry_after(response))
                else:
                    # GET es idempotente: reintentar es seguro
                    await self._sleep(0.5 * 2**attempt)
                continue
            raise BeloAPIError(
                f"belo respondió {response.status_code} en '{endpoint}'",
                status_code=response.status_code,
                code=code,
            )
        raise AssertionError("unreachable")

    async def paginate(
        self,
        endpoint: str,
        params: dict[str, Any] | None = None,
        stop: Callable[[dict], bool] | None = None,
        **path_params: Any,
    ) -> list[dict]:
        """
        Recorre todas las páginas (`limit=100`) hasta `pagination.nextPage == null`.

        `stop(item)` corta después de la página donde algún item lo cumple
        (útil en listas ordenadas de más nuevo a más viejo).
        """
        items: list[dict] = []
        page: int | None = 1
        while page is not None:
            body = await self.get(endpoint, {**(params or {}), "limit": PAGE_LIMIT, "page": page}, **path_params)
            data = body.get("data", [])
            items.extend(data)
            if stop and any(stop(item) for item in data):
                break
            page = (body.get("pagination") or {}).get("nextPage")
        return items

    async def get_balances(self) -> list[dict]:
        """
        Saldos de la cuenta por moneda.

        Los montos (`available`, `earned.*`) son strings decimales: no convertir a float.
        """
        return (await self.get("balances")).get("data", [])

    async def get_deposit_addresses(self) -> list[dict]:
        """
        Direcciones de depósito por moneda y red: `{currencyCode, network, value}`.

        🛡️ Incluye CVU y alias (network "cvu"/"alias"): no exponer al LLM ni loguear.
        """
        return (await self.get("deposit_addresses")).get("data", [])

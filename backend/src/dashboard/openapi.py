"""
Spec OpenAPI de la API REST (dashboard y scoring) y página de Swagger UI.

Los ejemplos de las respuestas 200 se generan con los perfiles demo y la
configuración vigente, así nunca quedan desactualizados respecto de los endpoints.
"""

import json
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any

from scoring_engine import demo
from scoring_engine.explain import explain_decision, methodology
from scoring_engine.service import demo_decision

from .transactions import build_transactions_payload

SPEC_PATH = Path(__file__).with_name("openapi.json")
EXAMPLE_TRANSACTIONS = 6
SWAGGER_UI_VERSION = "5.17.14"


@lru_cache(maxsize=1)
def _base_spec() -> dict[str, Any]:
    return json.loads(SPEC_PATH.read_text())


def example_payload(now: datetime | None = None) -> dict[str, Any]:
    """Respuesta real del perfil `family`, recortada a unos pocos movimientos variados."""
    payload = build_transactions_payload(
        demo.family(now or datetime.now(timezone.utc)), "demo-family", demo.PROFILE_NAMES["family"],
    )
    seen: set[str] = set()
    sample = []
    for t in reversed(payload["transactions"]):
        # Uno por tipo de detalle (tarjeta, crypto, transferencia, ingreso) para mostrar las variantes
        kind = "card" if "card" in t else "crypto" if "crypto" in t else t["type"]
        if kind not in seen:
            seen.add(kind)
            sample.append(t)
    sample += [t for t in reversed(payload["transactions"]) if t not in sample][: EXAMPLE_TRANSACTIONS - len(sample)]
    return {**payload, "transactions": sorted(sample, key=lambda t: t["createdAt"])}


def openapi_spec() -> dict[str, Any]:
    spec = json.loads(json.dumps(_base_spec()))  # copia: no mutar el cacheado
    content = spec["paths"]["/api/dashboard/transactions"]["get"]["responses"]["200"]["content"]["application/json"]
    content["examples"] = {
        "family": {
            "summary": "Perfil demo `family` (recortado)",
            "description": f"Primeros {EXAMPLE_TRANSACTIONS} movimientos representativos; `stats` es del total.",
            "value": example_payload(),
        }
    }

    profile = spec["paths"]["/api/scoring/profile"]["get"]["responses"]["200"]["content"]["application/json"]
    profile["examples"] = {
        "family": {
            "summary": "Elegible con oferta (perfil demo `family`)",
            "value": explain_decision(demo_decision("family"), demo=True),
        },
        "short_history": {
            "summary": "No elegible (perfil demo `short_history`)",
            "value": explain_decision(demo_decision("short_history"), demo=True),
        },
    }
    rules = spec["paths"]["/api/scoring/methodology"]["get"]["responses"]["200"]["content"]["application/json"]
    rules["examples"] = {"v1": {"summary": "Scorecard vigente", "value": methodology()}}
    return spec


def swagger_html(spec_url: str) -> str:
    cdn = f"https://cdn.jsdelivr.net/npm/swagger-ui-dist@{SWAGGER_UI_VERSION}"
    return f"""<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Dashboard API</title>
  <link rel="stylesheet" href="{cdn}/swagger-ui.css">
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="{cdn}/swagger-ui-bundle.js"></script>
  <script>
    window.ui = SwaggerUIBundle({{ url: "{spec_url}", dom_id: "#swagger-ui", deepLinking: true }});
  </script>
</body>
</html>"""

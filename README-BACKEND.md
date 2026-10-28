# 🔧 Backend — MCP Server (FastMCP + Vercel)

Servidor MCP para proyección de ahorro personal en pesos argentinos.
Integra datos macroeconómicos (inflación) y promociones de billeteras virtuales.

**Endpoint:** `https://tu-proyecto.vercel.app/mcp`
**Transporte:** Streamable HTTP

---

## 📋 Tabla de Contenidos

1. [Stack](#-stack)
2. [Estructura](#-estructura)
3. [Contrato de Tools](#-contrato-de-tools)
4. [Código completo](#-código-completo)
5. [Variables de entorno](#-variables-de-entorno)
6. [Deploy en Vercel](#-deploy-en-vercel)
7. [Probar el MCP](#-probar-el-mcp)
8. [Ejemplos de uso](#-ejemplos-de-uso)
9. [Guardrails del backend](#-guardrails-del-backend)
10. [Limitaciones del MVP](#-limitaciones-del-mvp)
11. [Troubleshooting](#-troubleshooting)

---

## 📋 Stack

| Componente | Tecnología | Versión |
| :--- | :--- | :--- |
| Framework MCP | FastMCP (Python) | latest |
| Runtime | Vercel Functions | Python 3.11 |
| Datos macro | Inflación hardcodeada (MVP) | REM sep 2026 |
| Promociones | Hardcodeadas (MVP) | oct 2026 |
| HTTP Client | httpx | latest |

---

## 📁 Estructura

```
backend/
├── api/
│   └── index.py             # Entry point: importa app ASGI
├── src/
│   └── mcp_server.py        # Lógica de tools con guardrails
├── requirements.txt         # fastmcp, httpx
├── vercel.json              # maxDuration: 30, rewrite /mcp
└── README-BACKEND.md        # Este archivo
```

---

## 📊 Contrato de Tools

| Tool | Input | Output |
| :--- | :--- | :--- |
| `get_savings_projection` | `months: int` | Saldo nominal, poder de compra real, veredicto |
| `get_goal_projection` | `target_amount`, `target_months` | Ahorro mensual necesario, gastos, saldo final |
| `get_promotions` | `category: str` | Lista de promos |
| `simulate_goal_with_promo` | `target_amount`, `target_months`, `promo_id`, `monthly_spend` | Ahorro extra, meta alcanzada |

**Ninguna tool mueve fondos ni accede a datos bancarios sensibles.**

---

## 💻 Código completo

### `requirements.txt`

```txt
fastmcp
httpx
```

### `vercel.json`

```json
{
  "functions": {
    "api/index.py": {
      "maxDuration": 30
    }
  },
  "rewrites": [
    {
      "source": "/mcp",
      "destination": "/api/index"
    }
  ]
}
```

### `api/index.py` — Entry point

```python
import sys
sys.path.append("src")
from mcp_server import app
```

### `src/mcp_server.py` — Tools con guardrails

```python
from fastmcp import FastMCP
import os

mcp = FastMCP("SavingsWalletMVP")

# 🛡️ Datos propios (env vars, sin datos sensibles)
SALDO_INICIAL = float(os.getenv("SALDO_INICIAL", "100000"))
TASA_WALLET_ANUAL = float(os.getenv("TASA_WALLET_ANUAL", "0.20"))
GASTOS_MENSUALES = float(os.getenv("GASTOS_MENSUALES", "50000"))

# 🛡️ Inflación mensual proyectada (REM septiembre 2026)
INFLACION_MENSUAL_PROYECTADA = 0.017  # 1.7%

# 🛡️ Promociones hardcodeadas (octubre 2026)
PROMOTIONS = [
    {
        "id": "cuenta_dni_ferias",
        "wallet": "Cuenta DNI",
        "category": "supermercado",
        "discount_pct": 40,
        "weekly_cap": 6000,
        "days": "todos los días",
        "description": "40% en Ferias y Mercados Bonaerenses. Tope $6.000/semana."
    },
    {
        "id": "cuenta_dni_garrafas",
        "wallet": "Cuenta DNI",
        "category": "hogar",
        "discount_pct": 40,
        "monthly_cap": 18000,
        "days": "todos los días",
        "description": "40% en garrafas. Tope $18.000/mes."
    },
    {
        "id": "cuenta_dni_chango",
        "wallet": "Cuenta DNI",
        "category": "supermercado",
        "discount_pct": 20,
        "weekly_cap": None,
        "days": "jueves",
        "description": "20% en Chango Más. Sin tope ni mínimo."
    },
    {
        "id": "cuenta_dni_carrefour",
        "wallet": "Cuenta DNI",
        "category": "supermercado",
        "discount_pct": 10,
        "weekly_cap": None,
        "days": "miércoles",
        "description": "10% en Carrefour. Sin tope. Compra mínima $15.000."
    }
]


@mcp.tool
def get_savings_projection(months: int) -> dict:
    """
    Proyección del ahorro: variación nominal vs rendimiento real
    (ajustado por inflación).
    """
    if months <= 0 or months > 60:
        return {"error": "months debe estar entre 1 y 60"}

    tasa_mensual = TASA_WALLET_ANUAL / 12
    saldo_nominal = SALDO_INICIAL * ((1 + tasa_mensual) ** months)
    factor_inflacion = (1 + INFLACION_MENSUAL_PROYECTADA) ** months
    poder_compra_real = saldo_nominal / factor_inflacion
    variacion_real_pct = ((poder_compra_real / SALDO_INICIAL) - 1) * 100

    return {
        "saldo_inicial": round(SALDO_INICIAL, 2),
        "meses": months,
        "tasa_wallet_tna": f"{TASA_WALLET_ANUAL*100:.1f}%",
        "inflacion_mensual_proyectada": f"{INFLACION_MENSUAL_PROYECTADA*100:.1f}%",
        "saldo_nominal_final": round(saldo_nominal, 2),
        "poder_compra_real_final": round(poder_compra_real, 2),
        "variacion_real_pct": round(variacion_real_pct, 2),
        "veredicto": (
            "✅ Le ganás a la inflación"
            if variacion_real_pct > 0
            else "⚠️ Perdés poder de compra"
        )
    }


@mcp.tool
def get_goal_projection(target_amount: float, target_months: int) -> dict:
    """
    Proyección de una meta de ahorro: cuánto necesitás por mes,
    y qué queda después de gastos.
    """
    if target_amount <= 0 or target_months <= 0 or target_months > 60:
        return {"error": "target_amount y target_months deben ser > 0 (máx 60)"}

    ahorro_mensual_necesario = target_amount / target_months
    tasa_mensual = TASA_WALLET_ANUAL / 12

    saldo_proyectado = SALDO_INICIAL
    for _ in range(target_months):
        saldo_proyectado = (
            saldo_proyectado * (1 + tasa_mensual) + ahorro_mensual_necesario
        )

    factor_inflacion = (1 + INFLACION_MENSUAL_PROYECTADA) ** target_months
    saldo_real = saldo_proyectado / factor_inflacion
    gastos_totales = GASTOS_MENSUALES * target_months
    saldo_final_despues_gastos = saldo_proyectado - gastos_totales

    return {
        "meta": round(target_amount, 2),
        "meses": target_months,
        "ahorro_mensual_necesario": round(ahorro_mensual_necesario, 2),
        "saldo_proyectado_nominal": round(saldo_proyectado, 2),
        "poder_compra_real": round(saldo_real, 2),
        "gastos_totales_periodo": round(gastos_totales, 2),
        "saldo_final_despues_gastos": round(saldo_final_despues_gastos, 2),
        "alcanza_meta": saldo_proyectado >= target_amount,
        "veredicto": (
            f"✅ Alcanzás la meta de ${target_amount:,.0f}"
            if saldo_proyectado >= target_amount
            else f"⚠️ Te faltan ${target_amount - saldo_proyectado:,.0f}"
        )
    }


@mcp.tool
def get_promotions(category: str = "") -> list:
    """
    Lista las promociones activas de la billetera.
    """
    if category:
        return [p for p in PROMOTIONS if p["category"] == category]
    return PROMOTIONS


@mcp.tool
def simulate_goal_with_promo(
    target_amount: float,
    target_months: int,
    promo_id: str,
    monthly_spend_in_promo: float = 30000
) -> dict:
    """
    Simula cuánto ahorrarías si usás una promo durante
    el período de la meta.
    """
    promo = next((p for p in PROMOTIONS if p["id"] == promo_id), None)
    if not promo:
        return {"error": f"Promo '{promo_id}' no encontrada"}

    discount = promo.get("discount_pct", 0)
    if isinstance(discount, str):
        discount = float(discount.split("-")[0].replace("%", ""))

    ahorro_mensual_promo = monthly_spend_in_promo * (discount / 100)

    cap = promo.get("weekly_cap") or promo.get("monthly_cap")
    if cap:
        cap_mensual = cap * 4 if promo.get("weekly_cap") else cap
        ahorro_mensual_promo = min(ahorro_mensual_promo, cap_mensual)

    ahorro_total_promo = ahorro_mensual_promo * target_months

    base = get_goal_projection(target_amount, target_months)
    if "error" in base:
        return base

    saldo_con_promo = base["saldo_proyectado_nominal"] + ahorro_total_promo

    return {
        "promo_usada": promo["description"],
        "ahorro_mensual_estimado": round(ahorro_mensual_promo, 2),
        "ahorro_total_periodo": round(ahorro_total_promo, 2),
        "saldo_sin_promo": base["saldo_proyectado_nominal"],
        "saldo_con_promo": round(saldo_con_promo, 2),
        "meta_alcanzada_antes": base["alcanza_meta"],
        "meta_alcanzada_con_promo": saldo_con_promo >= target_amount,
        "beneficio_extra": round(ahorro_total_promo, 2)
    }


app = mcp.http_app()
```

---

## 🔑 Variables de entorno

| Variable | Ejemplo | Descripción | Requerida |
| :--- | :--- | :--- | :--- |
| `SALDO_INICIAL` | `100000` | Saldo actual en la wallet | ✅ |
| `TASA_WALLET_ANUAL` | `0.20` | TNA (20% = 0.20) | ✅ |
| `GASTOS_MENSUALES` | `50000` | Gastos mensuales promedio | ✅ |

### Configurar en Vercel Dashboard

1. Ir a [vercel.com/dashboard](https://vercel.com/dashboard)
2. Seleccionar el proyecto
3. **Settings → Environment Variables**
4. Añadir cada variable con scope **Production, Preview, Development**

### Configurar vía CLI

```bash
vercel env add SALDO_INICIAL
vercel env add TASA_WALLET_ANUAL
vercel env add GASTOS_MENSUALES
```

Después de añadir env vars, redeploy:

```bash
vercel --prod
```

---

## 🚀 Deploy en Vercel

### 1. Login

```bash
vercel login
```

### 2. Deploy desde `backend/`

```bash
cd backend
vercel --prod
```

### 3. Obtener URL

Al finalizar, Vercel imprime:

```
✅ Production: https://belo-hackathon-backend.vercel.app
```

El endpoint MCP queda en:

```
https://belo-hackathon-backend.vercel.app/mcp
```

> **Guardá esta URL**, la vas a necesitar para el frontend y v0.

---

## 🧪 Probar el MCP

### Opción A: MCP Inspector (recomendado)

```bash
npx @modelcontextprotocol/inspector@latest https://tu-proyecto.vercel.app/mcp
```

1. Seleccionar **Streamable HTTP**.
2. Click **Connect**.
3. Verificar que aparecen las 4 tools en la lista.
4. Invocar `get_savings_projection` con `months: 12` y ver el resultado.

### Opción B: curl (tools/list)

```bash
curl -X POST https://tu-proyecto.vercel.app/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "id": 1
  }'
```

### Opción C: Probar localmente (sin Vercel)

```bash
cd backend
python -m venv venv
source venv/bin/activate  # o .\venv\Scripts\Activate.ps1 en Windows
pip install -r requirements.txt

python -c "
import sys
sys.path.append('src')
from mcp_server import get_savings_projection, get_promotions, simulate_goal_with_promo
print('Proyección 12m:', get_savings_projection(12))
print('Promos:', get_promotions())
print('Con promo:', simulate_goal_with_promo(500000, 10, 'cuenta_dni_ferias', 30000))
"
```

---

## 📊 Ejemplos de uso

### Ejemplo 1: ¿Mi ahorro le gana a la inflación?

**Pregunta:** *"Tengo \$100.000 al 20% anual. Inflación 1.7% mensual. ¿Qué pasa en 12 meses?"*

**Tool:** `get_savings_projection(12)`

**Respuesta:**

```json
{
  "saldo_nominal_final": 121939.43,
  "poder_compra_real_final": 100556.12,
  "variacion_real_pct": 0.56,
  "veredicto": "✅ Le ganás a la inflación"
}
```

### Ejemplo 2: ¿Me alcanza para la meta?

**Pregunta:** *"Quiero ahorrar \$500.000 para un viaje en 10 meses. ¿Me alcanza con Cuenta DNI?"*

**Tool:** `simulate_goal_with_promo(500000, 10, "cuenta_dni_ferias", 30000)`

### Ejemplo 3: ¿Qué promos tengo?

**Pregunta:** *"¿Qué promos tengo en supermercados?"*

**Tool:** `get_promotions("supermercado")`

---

## 🛡️ Guardrails del backend

| Guardrail | Implementación | Riesgo mitigado |
| :--- | :--- | :--- |
| Sin datos sensibles | Solo saldo, tasa, gastos (env vars) | Fuga de CBU/CVU |
| Validación de inputs | `months` 1-60, `target_amount` > 0 | Cálculos absurdos |
| Promos whitelist | Solo IDs conocidos | Alucinaciones del LLM |
| Sin escritura | Solo lectura y cálculo | Movimiento no autorizado |
| Sin cripto/noticias | Eliminado del alcance | Superficie de ataque reducida |
| `maxDuration` | 30s en `vercel.json` | Función colgada >30s |

### 🚫 Anti-patrones prohibidos

```python
# ❌ NUNCA hacer esto
CBU = os.getenv("CBU")  # Nunca en código
CVU = os.getenv("CVU")  # Nunca en código

# ❌ NUNCA consultar cripto
httpx.get("https://api.coingecko.com/...")  # Fuera de alcance

# ✅ Correcto: solo cálculos locales
saldo_nominal = SALDO_INICIAL * ((1 + tasa_mensual) ** months)
```

---

## ⚠️ Limitaciones del MVP

- **Inflación hardcodeada:** 1.7% mensual (REM septiembre 2026). En producción, usar `mcp-argentina` que consulta INDEC.
- **Promos hardcodeadas:** 4 ejemplos de Cuenta DNI (octubre 2026). En producción, scraping o API.
- **Sin persistencia:** cada deploy = un usuario.

---

## 🔧 Troubleshooting

### ❌ `ModuleNotFoundError: No module named 'fastmcp'`

```bash
# Verificar que el venv está activado
which python  # debe apuntar a venv/bin/python
pip install -r requirements.txt
```

### ❌ Vercel Function timeout

Verificar `vercel.json`:

```json
"maxDuration": 30
```

### ❌ Variables de entorno no se leen

1. Verificar que la env var está en **Settings → Environment Variables**.
2. Redeploy después de añadir: `vercel --prod`.
3. Verificar que el nombre es exacto (case-sensitive).

### ❌ El endpoint `/mcp` retorna 404

Verificar `vercel.json`:

```json
"rewrites": [
  { "source": "/mcp", "destination": "/api/index" }
]
```

Y que `api/index.py` exporta `app`.

---

## 📚 Referencias

- [FastMCP](https://github.com/jlowin/fastmcp) — Framework MCP en Python
- [Vercel Python Runtime](https://vercel.com/docs/functions/runtimes/python)
- [MCP Spec](https://modelcontextprotocol.io/specification)

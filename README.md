# 💰 Savings Wallet MCP

Servidor MCP (Model Context Protocol) para proyección de ahorro personal
en pesos argentinos. Integra datos macroeconómicos (inflación) y promociones
de billeteras virtuales.

**Stack:** FastMCP (Python) + Next.js + Vercel + v0 SDK
**Costo:** \$0 (Vercel Hobby + APIs públicas)
**Tiempo de setup:** ~1 hora

---

## 📋 Tabla de Contenidos

1. [¿Qué hace este proyecto?](#-qué-hace-este-proyecto)
2. [Arquitectura](#-arquitectura)
3. [Requisitos previos](#-requisitos-previos)
4. [Descarga del proyecto](#-descarga-del-proyecto)
5. [Setup del Backend (MCP Server)](#-setup-del-backend-mcp-server)
6. [Setup del Frontend (Chat UI)](#-setup-del-frontend-chat-ui)
7. [Conexión a v0](#-conexión-a-v0)
8. [Guardrails de seguridad](#-guardrails-de-seguridad)
9. [Probar el MCP](#-probar-el-mcp)
10. [Estructura del repositorio](#-estructura-del-repositorio)
11. [Troubleshooting](#-troubleshooting)
12. [Roadmap](#-roadmap)
13. [Licencia](#-licencia)

---

## 🎯 ¿Qué hace este proyecto?

Un MCP que expone **4 tools read-only** a cualquier cliente MCP (Cursor, v0):

| Tool | Input | Output |
| :--- | :--- | :--- |
| `get_savings_projection` | `months: int` | Variación real del ahorro vs inflación |
| `get_goal_projection` | `target_amount`, `target_months` | Proyección de meta, gastos, saldo final |
| `get_promotions` | `category: str` (opcional) | Promos activas de la wallet |
| `simulate_goal_with_promo` | `target_amount`, `target_months`, `promo_id` | Ahorro potencial con promo aplicada |

**Ejemplo de uso:**

> *"Tengo \$100.000 en la wallet al 20% anual. Si la inflación es 1.7% mensual, ¿qué pasa en 12 meses?"*

El LLM invoca `get_savings_projection(12)` y responde si el ahorro le gana a la inflación.

**Lo que NO hace (por diseño):**

- ❌ No consulta precios de cripto
- ❌ No lee noticias
- ❌ No mueve fondos
- ❌ No accede a CBU/CVU

---

## 🏗️ Arquitectura

```
┌─────────────┐     ┌─────────────────────┐     ┌──────────────────┐
│   Cliente    │────▶│    MCP Server        │────▶│  APIs públicas   │
│  (Cursor,    │     │  (Vercel, Python)    │     │  (inflación,     │
│   v0)        │     │   Read-only          │     │   dólar)         │
└─────────────┘     └─────────────────────┘     └──────────────────┘
       │                      │
       │ HTTP                 │ 🛡️ Sin datos sensibles
       │                      │ 🛡️ Validación de inputs
       ▼                      │ 🛡️ Promos whitelist
┌─────────────┐               │ 🛡️ Sin escritura
│  Frontend    │               └──────────────────────
│  (Next.js)   │
└─────────────┘
```

**Tres capas desacopladas:**

1. **Frontend** (Next.js): chat UI opcional para usuarios humanos.
2. **MCP Server** (Vercel): 4 tools, sin estado.
3. **Consumidores** (Cursor, v0): agentes que invocan las tools.

---

## ✅ Requisitos Previos

| Herramienta | Versión | Instalación |
| :--- | :--- | :--- |
| **Node.js** | >= 18 | [nodejs.org](https://nodejs.org) |
| **Python** | >= 3.11 | [python.org](https://python.org) |
| **Git** | >= 2.40 | [git-scm.com](https://git-scm.com) |
| **Vercel CLI** | latest | `npm install -g vercel` |
| **Cuenta Vercel** | free | [vercel.com/signup](https://vercel.com/signup) |
| **OpenAI API Key** | — | [platform.openai.com](https://platform.openai.com) (solo frontend) |
| **v0 API Key** | — | [v0.dev](https://v0.dev) (solo integración v0) |

Verificar instalación:

```bash
node --version    # v18+
python --version  # 3.11+
git --version     # 2.40+
vercel --version  # latest
```

---

## 📥 Descarga del Proyecto

### Opción A: Clonar desde Git

```bash
git clone https://github.com/luchoxiii/belo_hackathon.git
cd belo_hackathon
```

### Opción B: Crear desde cero (sin repo previo)

```bash
mkdir belo_hackathon && cd belo_hackathon

# Backend
mkdir -p backend/api backend/src
touch backend/api/index.py
touch backend/src/mcp_server.py
touch backend/requirements.txt
touch backend/vercel.json

# Frontend
mkdir -p frontend/app/api/chat frontend/components
touch frontend/app/api/chat/route.ts
touch frontend/app/page.tsx
touch frontend/app/layout.tsx
touch frontend/package.json
touch frontend/.env.local

# Docs
mkdir -p docs
touch docs/README-MCP-V0.md
touch docs/GUARDRAILS.md
```

---

## ⚙️ Setup del Backend (MCP Server)

### 1. Navegar al directorio

```bash
cd backend
```

### 2. Crear entorno virtual

```bash
python -m venv venv

# macOS/Linux:
source venv/bin/activate

# Windows PowerShell:
.\venv\Scripts\Activate.ps1
```

### 3. Instalar dependencias

```bash
pip install -r requirements.txt
```

### 4. Configurar variables de entorno locales

Crear `backend/.env`:

```env
SALDO_INICIAL=100000
TASA_WALLET_ANUAL=0.20
GASTOS_MENSUALES=50000
```

### 5. Probar localmente

```bash
python -c "
import sys
sys.path.append('src')
from mcp_server import get_savings_projection, get_promotions
print('Proyección:', get_savings_projection(12))
print('Promos:', get_promotions())
"
```

Si ves datos de proyección y promos, el backend funciona.

### 6. Desplegar en Vercel

```bash
vercel login
vercel --prod
```

### 7. Configurar variables de entorno en Vercel

```bash
vercel env add SALDO_INICIAL        # Ingresar: 100000
vercel env add TASA_WALLET_ANUAL    # Ingresar: 0.20
vercel env add GASTOS_MENSUALES     # Ingresar: 50000
```

O desde el dashboard: **Settings → Environment Variables**.

> **Guardá la URL:** `https://tu-proyecto.vercel.app/mcp`

---

## 🎨 Setup del Frontend (Chat UI)

> **Opcional:** si solo vas a usar el MCP desde Cursor o v0, podés saltar esta sección.

### 1. Navegar al directorio

```bash
cd ../frontend
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Configurar `.env.local`

```env
OPENAI_API_KEY=sk-...
MCP_SERVER_URL=https://tu-proyecto.vercel.app/mcp
```

### 4. Probar localmente

```bash
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000) y preguntar:

> *"¿Mi ahorro le gana a la inflación?"*

### 5. Desplegar en Vercel

```bash
vercel --prod
```

---

## 🔌 Conexión a v0

### 1. Instalar el SDK de v0

```bash
npm install v0-sdk
```

### 2. Registrar el MCP

```typescript
import { v0 } from "v0-sdk";

const server = await v0.mcpServers.create({
  name: "Savings Wallet (Read-Only)",
  url: "https://tu-proyecto.vercel.app/mcp",
});

console.log(server.id); // Guardar en V0_MCP_SERVER_ID
```

### 3. Usar en un chat

```typescript
const chat = await v0.chats.create({
  message: "Quiero ahorrar $500.000 para un viaje en 10 meses. ¿Me alcanza con Cuenta DNI?",
  mcpServerIds: [process.env.V0_MCP_SERVER_ID!],
});
```

v0 hará disponibles las 4 tools del MCP al agente durante esa sesión.

> **Documentación completa:** [docs/README-MCP-V0.md](./docs/README-MCP-V0.md)

---

## 🛡️ Guardrails de Seguridad

| Capa | Guardrail | Implementación |
| :--- | :--- | :--- |
| **Backend** | Sin datos sensibles | Solo saldo, tasa, gastos (env vars). Nunca CBU/CVU. |
| **Backend** | Validación de inputs | `months` 1-60, `target_amount` > 0 |
| **Backend** | Promos whitelist | Solo IDs conocidos |
| **Backend** | Sin escritura | Solo lectura y cálculo |
| **Frontend** | Sanitización | `maxLength={500}` |
| **Frontend** | Rate limit | 2s entre mensajes |
| **v0** | Auth opcional | Bearer token si se configura |

> **Matriz completa:** [docs/GUARDRAILS.md](./docs/GUARDRAILS.md)

---

## 🧪 Probar el MCP

### MCP Inspector

```bash
npx @modelcontextprotocol/inspector@latest https://tu-proyecto.vercel.app/mcp
```

Seleccionar **Streamable HTTP** y conectar.

### Cursor

Editar `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "savings-wallet": {
      "url": "https://tu-proyecto.vercel.app/mcp"
    }
  }
}
```

### curl

```bash
curl -X POST https://tu-proyecto.vercel.app/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "id": 1
  }'
```

Deberías ver las 4 tools en la respuesta.

---

## 📁 Estructura del Repositorio

```
belo_hackathon/
│
├── README.md                    # Este archivo
│
├── backend/                     # FastMCP en Vercel (Python)
│   ├── api/
│   │   └── index.py             # Entry point: importa app ASGI
│   ├── src/
│   │   └── mcp_server.py        # 4 tools con guardrails
│   ├── requirements.txt         # fastmcp, httpx
│   ├── vercel.json              # maxDuration: 30, rewrite /mcp
│   └── README-BACKEND.md        # Documentación detallada
│
├── frontend/                    # Next.js + AI SDK
│   ├── app/
│   │   ├── api/chat/route.ts    # Proxy con guardrails
│   │   ├── page.tsx             # Chat UI
│   │   └── layout.tsx
│   ├── .env.local               # OPENAI_API_KEY, MCP_SERVER_URL
│   ├── package.json
│   └── README-FRONTEND.md       # Documentación detallada
│
└── docs/
    ├── README-MCP-V0.md         # Conexión a v0
    └── GUARDRAILS.md            # Matriz consolidada de seguridad
```

---

## 🔧 Troubleshooting

### ❌ `vercel: command not found`

```bash
npm install -g vercel

# Si persiste:
npm config get prefix
```

### ❌ `ModuleNotFoundError: No module named 'fastmcp'`

```bash
# Verificar venv activado
which python
pip install -r requirements.txt
```

### ❌ Inflación desactualizada

El MVP usa inflación hardcodeada (1.7% mensual). Para producción, integrar
`mcp-argentina` que consulta INDEC o Apify Argentina Economic Data.

### ❌ Vercel Function timeout

Verificar `vercel.json`:

```json
"maxDuration": 30
```

### ❌ v0 no conecta al MCP

1. Verificar que el MCP responde en `/mcp` (curl).
2. Verificar que la URL usa `https://`.
3. Verificar que `mcpServerIds` incluye el ID correcto.

### ❌ Cursor no muestra las tools

1. Reiniciar Cursor después de editar `mcp.json`.
2. Verificar que la URL termina en `/mcp`.
3. Revisar logs de Cursor (View → Output → MCP).

---

## 🗺️ Roadmap

### v0.1 (MVP actual) ✅

- [x] 4 tools de proyección de ahorro
- [x] Promos hardcodeadas (Cuenta DNI, MODO, Belo)
- [x] FastMCP en Vercel
- [x] Integración v0

### v0.2 (próximo)

- [ ] Inflación en tiempo real vía `mcp-argentina`
- [ ] Tipo de cambio blue vía `dolar-mcp`
- [ ] Persistencia en Turso

### v0.3 (futuro)

- [ ] Scraping automático de promos
- [ ] Multi-usuario con auth

---

## 📄 Licencia

**MIT License.**

Este MCP solo hace proyecciones y cálculos. No mueve fondos ni accede a
datos bancarios sensibles.

---

## 🙏 Créditos

- [FastMCP](https://github.com/jlowin/fastmcp) — Framework MCP en Python
- [Vercel](https://vercel.com/) — Hosting serverless
- [Vercel AI SDK](https://sdk.vercel.ai/) — Chat UI
- [v0](https://v0.dev/) — Agente con MCP

---

## 📞 Soporte

- **Issues:** [github.com/luchoxiii/belo_hackathon/issues](https://github.com/luchoxiii/belo_hackathon/issues)
- **Documentación MCP:** [modelcontextprotocol.io](https://modelcontextprotocol.io/)
- **Vercel Docs:** [vercel.com/docs](https://vercel.com/docs)

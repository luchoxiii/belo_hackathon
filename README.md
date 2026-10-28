# 🪙 Crypto Wallet MCP

Servidor MCP (Model Context Protocol) para una billetera cripto personal.
Permite a un LLM consultar el valor del portafolio, leer noticias recientes,
recuperar escenarios históricos y simular el impacto de un viaje.

**Stack:** FastMCP (Python) + Next.js + Vercel + v0 SDK
**Costo:** \$0 (Vercel Hobby + CoinGecko free + RSS)
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

Un MCP que expone **4 tools read-only** a cualquier cliente MCP (Cursor, Claude Desktop, v0):

| Tool | Input | Output |
| :--- | :--- | :--- |
| `get_portfolio_value` | — | Valor actual de BTC/ETH en USD |
| `get_latest_news` | — | 5 titulares de CoinDesk RSS |
| `get_historical_analog` | `event_type` | Datos de FTX, elecciones o halving |
| `simulate_trip_impact` | `days`, `fiat_needed` | Simulación de caída tipo FTX durante viaje |

**Ejemplo de uso:**

> *"Si me voy 14 días de viaje y necesito \$2000, ¿me alcanza si pasa algo como FTX?"*

El LLM invoca `simulate_trip_impact(14, 2000)` y responde con la narrativa.

**Lo que NO hace (por diseño):**

- ❌ No firma transacciones
- ❌ No accede a claves privadas
- ❌ No mueve fondos
- ❌ No escribe en blockchain

---

## 🏗️ Arquitectura

```
┌─────────────┐     ┌─────────────────────┐     ┌──────────────────┐
│   Cliente    │────▶│    MCP Server        │────▶│ CoinGecko / RSS  │
│  (Cursor,    │     │  (Vercel, Python)    │     │ (APIs públicas)  │
│   v0)        │     │   Read-only          │     │                  │
└─────────────┘     └─────────────────────┘     └──────────────────┘
       │                      │
       │ HTTP                 │ 🛡️ Sin claves privadas
       │ + Bearer token       │ 🛡️ Rate limit interno
       ▼                      │ 🛡️ Timeout HTTP 10s
┌─────────────┐               │ 🛡️ Validación de inputs
│  Frontend    │               │ 🛡️ Whitelist de escenarios
│  (Next.js)   │               └──────────────────────
└─────────────┘
```

**Tres capas desacopladas:**

1. **Frontend** (Next.js): chat UI opcional para usuarios humanos.
2. **MCP Server** (Vercel): 4 tools, sin estado, sin base de datos.
3. **Consumidores** (Cursor, v0): agentes que invocan las tools.

---

## ✅ Requisitos Previos

Antes de empezar, asegurate de tener:

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

Si no tenés repo, creá la estructura manualmente:

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

Luego copiá el contenido de cada archivo desde los READMEs correspondientes:

- `backend/README-BACKEND.md` → código del backend
- `frontend/README-FRONTEND.md` → código del frontend
- `docs/README-MCP-V0.md` → integración con v0
- `docs/GUARDRAILS.md` → matriz de seguridad

---

## ⚙️ Setup del Backend (MCP Server)

### 1. Navegar al directorio

```bash
cd backend
```

### 2. Crear entorno virtual de Python

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

Contenido de `requirements.txt`:

```
fastmcp
feedparser
httpx
```

### 4. Configurar variables de entorno locales (opcional)

Para probar localmente, creá `backend/.env`:

```env
BTC_AMOUNT=0.5
ETH_AMOUNT=2.0
MCP_API_TOKEN=tu-token-secreto-aqui
```

### 5. Probar localmente (sin Vercel)

```bash
python -c "
import sys
sys.path.append('src')
from mcp_server import get_portfolio_value, get_latest_news
print('Portafolio:', get_portfolio_value())
print('Noticias:', get_latest_news())
"
```

Si ves precios y titulares, el backend funciona.

### 6. Desplegar en Vercel

```bash
vercel login
vercel --prod
```

Seguí las instrucciones interactivas:

- **Set up and deploy?** → Y
- **Which scope?** → tu cuenta personal
- **Link to existing project?** → N
- **Project name?** → `belo_hackathon` (o el que prefieras)
- **Directory?** → `./` (estás dentro de `backend/`)

### 7. Configurar variables de entorno en Vercel

```bash
vercel env add BTC_AMOUNT      # Ingresar: 0.5 (o tu cantidad real)
vercel env add ETH_AMOUNT      # Ingresar: 2.0 (o tu cantidad real)
vercel env add MCP_API_TOKEN   # Ingresar: un token random (ej. openssl rand -hex 32)
```

O desde el dashboard: **Settings → Environment Variables**.

### 8. Verificar el deploy

```bash
curl https://tu-proyecto.vercel.app/mcp
```

Deberías recibir un error 401 (si configuraste auth) o un JSON de estado.
Esto es correcto: el MCP solo responde a requests MCP válidos.

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
MCP_API_TOKEN=tu-token-secreto-aqui
```

### 4. Probar localmente

```bash
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000) y preguntar:

> *"¿Cuánto vale mi portafolio?"*

### 5. Desplegar en Vercel

```bash
vercel --prod
```

Configurar las mismas env vars en el dashboard de Vercel del frontend.

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
  name: "Crypto Wallet (Read-Only)",
  url: "https://tu-proyecto.vercel.app/mcp",
  headers: {
    "Authorization": `Bearer ${process.env.MCP_API_TOKEN}`,
  },
});

console.log(server.id); // Guardar en V0_MCP_SERVER_ID
```

### 3. Usar en un chat

```typescript
const chat = await v0.chats.create({
  message: "Simula un viaje de 14 días con $2000 si pasa algo como FTX",
  mcpServerIds: [process.env.V0_MCP_SERVER_ID!],
});
```

v0 hará disponibles las 4 tools del MCP al agente durante esa sesión.

> **Documentación completa:** [docs/README-MCP-V0.md](./docs/README-MCP-V0.md)

---

## 🛡️ Guardrails de Seguridad

Este proyecto implementa guardrails en **4 capas**:

### Capa 1: Frontend

- ✅ Sanitización de input (`maxLength={500}`)
- ✅ Rate limit UI (2s entre mensajes)
- ✅ `MCP_SERVER_URL` nunca expuesto al cliente

### Capa 2: Backend

- ✅ Sin claves privadas (no importa `web3.eth.account`)
- ✅ Solo lectura (4 tools de consulta)
- ✅ Validación de inputs (`days>0`, `fiat_needed>0`)
- ✅ Timeout HTTP (10s)
- ✅ Manejo de 429 (error controlado)
- ✅ Whitelist de escenarios (solo 3 eventos válidos)
- ✅ Rate limit interno (2s entre CoinGecko)

### Capa 3: Vercel

- ✅ `maxDuration: 30` en `vercel.json`
- ✅ Payload < 4.5MB (límite de plataforma)

### Capa 4: v0

- ✅ Auth Bearer (header `Authorization`)
- ✅ HTTPS obligatorio
- ✅ Tools read-only
- ✅ Audience binding (token bindeado a URL)

> **Matriz completa:** [docs/GUARDRAILS.md](./docs/GUARDRAILS.md)

### 🚫 Anti-Patrones Prohibidos

| Anti-Patrón | Por qué |
| :--- | :--- |
| `PRIVATE_KEY` en env vars | Prompt injection podría exfiltrarla |
| Tool `send_transaction()` | El LLM nunca debe mover fondos |
| `web3.eth.account.sign()` | La firma ocurre fuera del MCP |
| Token en URL query string | Se filtra en logs |

---

## 🧪 Probar el MCP

### Opción A: MCP Inspector (recomendado)

```bash
npx @modelcontextprotocol/inspector@latest https://tu-proyecto.vercel.app/mcp
```

1. Seleccionar **Streamable HTTP** como transporte.
2. Añadir header `Authorization: Bearer <tu-token>` si configuraste auth.
3. Conectar.
4. Verificar que aparecen las 4 tools.
5. Invocar `get_portfolio_value` y ver el resultado.

### Opción B: Cursor

Editar `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "crypto-wallet": {
      "url": "https://tu-proyecto.vercel.app/mcp",
      "headers": {
        "Authorization": "Bearer tu-token-secreto-aqui"
      }
    }
  }
}
```

Reiniciar Cursor y preguntar:

> *"¿Cuánto vale mi portafolio?"*

### Opción C: curl (sin MCP Inspector)

```bash
curl -X POST https://tu-proyecto.vercel.app/mcp \
  -H "Authorization: Bearer tu-token" \
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
crypto-wallet-mcp/
│
├── README.md                    # Este archivo
│
├── backend/                     # FastMCP en Vercel (Python)
│   ├── api/
│   │   └── index.py             # Entry point: importa app ASGI
│   ├── src/
│   │   └── mcp_server.py        # 4 tools con guardrails
│   ├── requirements.txt         # fastmcp, feedparser, httpx
│   ├── vercel.json              # maxDuration: 30, rewrite /mcp
│   └── README-BACKEND.md        # Documentación detallada
│
├── frontend/                    # Next.js + AI SDK
│   ├── app/
│   │   ├── api/chat/route.ts    # Proxy con guardrails
│   │   ├── page.tsx             # Chat UI
│   │   └── layout.tsx
│   ├── components/
│   │   └── chat.tsx
│   ├── .env.local               # OPENAI_API_KEY, MCP_SERVER_URL
│   ├── package.json
│   └── README-FRONTEND.md       # Documentación detallada
│
└── docs/
    ├── README-MCP-V0.md         # Conexión a v0 con auth
    └── GUARDRAILS.md            # Matriz consolidada de seguridad
```

---

## 🔧 Troubleshooting

### ❌ `vercel: command not found`

```bash
npm install -g vercel

# Si persiste, verificar PATH de npm:
npm config get prefix
```

### ❌ `ModuleNotFoundError: No module named 'fastmcp'`

```bash
# Verificar que el venv está activado
which python  # debe apuntar a venv/bin/python
pip install -r requirements.txt
```

### ❌ CoinGecko retorna 429

El plan free tiene límite de 30 req/min. El MCP ya incluye rate limit interno (2s).
Si persiste:

- Esperar 60s y reintentar.
- O migrar a CoinGecko Demo API (con key gratuita).

### ❌ Vercel Function timeout

Verificar `vercel.json`:

```json
"maxDuration": 30
```

Y que el timeout de `httpx` sea 10s (menor que 30s).

### ❌ v0 no conecta al MCP

1. Verificar que el MCP responde en `/mcp` (curl).
2. Verificar que el token es correcto en el header.
3. Verificar que la URL usa `https://`.
4. Verificar que `mcpServerIds` incluye el ID correcto.

### ❌ Cursor no muestra las tools

1. Reiniciar Cursor después de editar `mcp.json`.
2. Verificar que la URL termina en `/mcp`.
3. Revisar logs de Cursor (View → Output → MCP).

### ❌ `BTC_AMOUNT` no se lee en Vercel

1. Verificar que la env var está en **Settings → Environment Variables**.
2. Redeploy después de añadir: `vercel --prod`.
3. Verificar que el nombre es exacto (case-sensitive).

---

## 🗺️ Roadmap

### v0.1 (MVP actual) ✅

- [x] 4 tools read-only
- [x] FastMCP en Vercel
- [x] Frontend Next.js
- [x] Integración v0
- [x] Guardrails en 4 capas

### v0.2 (próximo)

- [ ] Persistencia en Turso (SQLite serverless)
- [ ] Auth real (JWT en lugar de API key)
- [ ] Rate limit distribuido (Upstash Redis)
- [ ] Logs estructurados (Vercel Logs + Sentry)

### v0.3 (futuro)

- [ ] Indexación on-chain (Squid SDK)
- [ ] Búsqueda vectorial de eventos (pgvector)
- [ ] Scraping de promociones (servicio separado)
- [ ] Multi-usuario (auth + DB multi-tenant)

### Nunca en el MCP ❌

- Firma de transacciones
- Acceso a claves privadas
- Escritura en blockchain

---

## 📄 Licencia

**MIT License.**

Este MCP no firma transacciones ni accede a claves privadas.
Úsalo bajo tu propio riesgo. Los datos de precios son de CoinGecko
y pueden tener latencia o inexactitudes. **No es asesoramiento financiero.**

---

## 🙏 Créditos

- [FastMCP](https://github.com/jlowin/fastmcp) — Framework MCP en Python
- [Vercel](https://vercel.com/) — Hosting serverless
- [CoinGecko](https://coingecko.com/) — Precios de cripto
- [CoinDesk](https://coindesk.com/) — Noticias RSS
- [Vercel AI SDK](https://sdk.vercel.ai/) — Chat UI
- [v0](https://v0.dev/) — Agente con MCP

---

## 📞 Soporte

- **Issues:** [github.com/luchoxiii/belo_hackathon/issues](https://github.com/luchoxiii/belo_hackathon/issues)
- **Documentación MCP:** [modelcontextprotocol.io](https://modelcontextprotocol.io/)
- **Vercel Docs:** [vercel.com/docs](https://vercel.com/docs)

# 🔌 Conexión del MCP a v0

Guía para registrar y usar el MCP de ahorro en v0 vía `v0-sdk`.

**Requisito:** Backend desplegado en Vercel (`https://tu-proyecto.vercel.app/mcp`)

---

## 📋 Tabla de Contenidos

1. [Requisito previo](#-requisito-previo)
2. [Instalación](#-instalación)
3. [Registrar el MCP en v0](#-registrar-el-mcp-en-v0)
4. [Usar en un chat](#-usar-en-un-chat)
5. [Flujo completo](#-flujo-completo)
6. [Guardrails para v0](#-guardrails-para-v0)
7. [Checklist de integración](#-checklist-de-integración)

---

## 📋 Requisito previo

El backend MCP debe estar desplegado y accesible:

```bash
curl -X POST https://tu-proyecto.vercel.app/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

Deberías ver las 4 tools (`get_savings_projection`, `get_goal_projection`, `get_promotions`, `simulate_goal_with_promo`) en la respuesta. Si no, revisá [backend/README-BACKEND.md](../backend/README-BACKEND.md).

---

## 📦 Instalación

```bash
npm install v0-sdk
```

O con pnpm:

```bash
pnpm add v0-sdk
```

---

## 📝 Registrar el MCP en v0

v0 permite conectar cualquier MCP server custom proporcionando la URL del endpoint.

```typescript
import { v0 } from "v0-sdk";

const server = await v0.mcpServers.create({
  name: "Savings Wallet (Read-Only)",
  url: "https://tu-proyecto.vercel.app/mcp",
});

console.log("ID:", server.id); // Guardar en .env: V0_MCP_SERVER_ID=mcp_abc123
```

---

## 💬 Usar en un chat

```typescript
const chat = await v0.chats.create({
  message: "Quiero ahorrar $500.000 para un viaje en 10 meses. ¿Me alcanza con Cuenta DNI?",
  mcpServerIds: [process.env.V0_MCP_SERVER_ID!],
});
```

v0 hará disponibles las 4 tools del MCP al agente durante esa sesión.

---

## 🔄 Flujo completo

```
┌─────────────┐     ┌─────────────────────┐     ┌──────────────────┐
│   v0 Chat   │────▶│    MCP Server        │────▶│ Promos + macro   │
│  (agente)   │     │ (Vercel, read-only)  │     │  (hardcodeado)   │
└─────────────┘     └─────────────────────┘     └──────────────────┘
       │                      │
       │ mcpServerIds         │ 🛡️ Sin datos sensibles
       ▼                      │ 🛡️ Solo lectura
┌─────────────┐               │ 🛡️ Validación de inputs
│   v0 SDK    │               └──────────────────────
└─────────────┘
```

---

## 🛡️ Guardrails para v0

| Guardrail | Implementación |
| :--- | :--- |
| **Sin auth (MVP)** | El MCP no requiere Bearer token |
| **Tools read-only** | Solo 4 tools de consulta |
| **Sin datos sensibles** | No hay CBU/CVU expuestos |
| **HTTPS obligatorio** | URL `https://` |

Para producción: podés añadir Bearer token en el registro:

```typescript
const server = await v0.mcpServers.create({
  name: "Savings Wallet",
  url: "https://tu-proyecto.vercel.app/mcp",
  headers: {
    Authorization: `Bearer ${process.env.MCP_API_TOKEN}`,
  },
});
```

---

## ✅ Checklist de Integración

- [ ] Backend desplegado y accesible en `/mcp`
- [ ] MCP registrado con `v0.mcpServers.create()`
- [ ] `V0_MCP_SERVER_ID` guardado en env
- [ ] Chat de prueba invoca `get_savings_projection` exitosamente
- [ ] Verificar que solo aparecen 4 tools (ninguna de escritura o movimiento de fondos)

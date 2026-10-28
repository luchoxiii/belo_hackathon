# 🛡️ Guardrails — Savings Wallet MCP

## Principio Rector

> **El MCP solo hace proyecciones y cálculos. No mueve fondos ni accede a datos bancarios sensibles.**

---

## 🛡️ Matriz Completa

| Capa | Guardrail | Implementación | Riesgo Mitigado |
| :--- | :--- | :--- | :--- |
| **Backend** | Sin datos sensibles | Solo saldo, tasa, gastos (env vars) | Fuga de CBU/CVU |
| **Backend** | Validación de inputs | `months` 1-60, `target_amount` > 0 | Cálculos absurdos |
| **Backend** | Promos whitelist | Solo IDs conocidos | Alucinaciones del LLM |
| **Backend** | Sin escritura | Solo lectura y cálculo | Movimiento no autorizado |
| **Backend** | Sin cripto/noticias | Eliminado del alcance | Superficie de ataque reducida |
| **Frontend** | Sanitización | `maxLength={500}` | Prompt injection |
| **Frontend** | Rate limit | 2s entre mensajes | Abuso de API |
| **Frontend** | Secretos | `MCP_SERVER_URL` solo en `route.ts` | Fuga de credenciales |
| **v0** | Tools read-only | Solo 4 tools de consulta | Agente mueve fondos |

---

## 🚫 Anti-Patrones Prohibidos

| Anti-Patrón | Por qué |
| :--- | :--- |
| `PRIVATE_KEY` | Ya no aplica (no hay cripto) |
| `send_transaction()` | No existe ni se implementa |
| Consultar CoinGecko/CoinDesk | Eliminado del alcance |
| Hardcodear CBU/CVU | Nunca en código ni variables |
| Exponer saldo real en logs | Fuga de datos personales |

---

## 📊 Flujo de un Request

```
Usuario → Frontend (sanitiza, rate limit)
        → MCP Server (valida inputs)
        → Cálculo local (inflación proyectada)
        → Respuesta (sin datos sensibles)
        → v0 (solo tools read-only)
        → Usuario
```

---

## ✅ Checklist Pre-Deploy

- [ ] `grep -r "CBU\|CVU\|PRIVATE_KEY" .` → sin resultados
- [ ] `vercel.json` tiene `maxDuration: 30`
- [ ] Env vars de Vercel: `SALDO_INICIAL`, `TASA_WALLET_ANUAL`, `GASTOS_MENSUALES`
- [ ] Frontend: `MCP_SERVER_URL` solo en `route.ts`
- [ ] MCP Inspector muestra solo 4 tools
- [ ] No hay referencias a CoinGecko ni CoinDesk en el código

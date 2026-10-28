# 🛡️ Guardrails — Savings Wallet MCP + Scoring crediticio

## Principio Rector

> **El MCP solo lee, calcula y simula. No mueve fondos, no otorga ni desembolsa préstamos y nunca expone datos bancarios sensibles al LLM.**

---

## 🛡️ Matriz Completa

| Capa | Guardrail | Implementación | Riesgo Mitigado |
| :--- | :--- | :--- | :--- |
| **Backend** | Validación de inputs | `months` 1-60, `target_amount` > 0, monto/plazo dentro de la oferta | Cálculos absurdos |
| **Backend** | Promos whitelist | Solo IDs conocidos | Alucinaciones del LLM |
| **Backend** | Sin escritura | Solo lectura y cálculo | Movimiento no autorizado |
| **belo API** | Solo GET + whitelist | `belo_client.ENDPOINTS`; test AST que prohíbe `post/put/patch/delete` | Crear transacciones (los "preview" crean pendientes en el ledger) |
| **belo API** | Credencial por usuario | Header `X-Belo-Api-Key` de la conexión MCP, **nunca** argumento de tool | Credencial expuesta al LLM |
| **belo API** | Key fuera de logs/errores | Mensajes de `BeloAPIError` sin la key; decisiones con `subject_id` = sha256 | Fuga de credenciales |
| **Scoring** | Salidas mínimas al LLM | `scoring_engine.service.public_*`: score, banda, razones y oferta; sin contrapartes, CVU ni direcciones | Fuga de datos personales |
| **Scoring** | Sin `civilStatus` | No está en `DeclaredProfile` | Discriminación |
| **Scoring** | Compliance solo como filtro | `pep` → revisión manual, no puntos | Uso indebido de flags |
| **Scoring** | Oferta indicativa | `disclaimer` en cada oferta/simulación; sin tools de desembolso | Compromiso de otorgamiento |
| **Scoring** | Montos en `Decimal` | Prohibido `float` en `belo_client`, `belo_scoring`, `scoring_engine` | Errores de redondeo con dinero |
| **Dashboard / Scoring** | REST solo lectura + CORS acotado | `GET /api/dashboard/transactions`, `GET /api/scoring/profile` y `/methodology`; credencial por header; orígenes en `DASHBOARD_ALLOWED_ORIGINS`; sin alias/CVU ni claves de contraparte | Fuga de datos / acceso desde otros sitios |
| **Fuentes** | Datos dummy marcados | Fuentes dummy (`sources/dummy/`) sin conexión a servicios; `live: false`, `uses_dummy_data` en scoring y `source` en el dashboard | Presentar un score con datos sintéticos como real |
| **Fuentes** | Únicos endpoints de escritura acotados | `POST`/`DELETE /api/sources/{id}` solo cambian qué fuentes se combinan (por usuario, en `data/connections.json`); no mueven fondos ni se conectan a servicios; belo no se desconecta | Escrituras con efecto financiero |
| **Datos** | Fuera de git | `data/` y `.env` en `.gitignore` | Datos financieros reales en el repo |
| **Frontend** | Sanitización | `maxLength={500}` | Prompt injection |
| **Frontend** | Rate limit | 2s entre mensajes | Abuso de API |
| **Frontend** | Secretos | `MCP_SERVER_URL` solo en `route.ts` | Fuga de credenciales |
| **v0** | Tools read-only | 7 tools de consulta/simulación | Agente mueve fondos |

---

## 🚫 Anti-Patrones Prohibidos

| Anti-Patrón | Por qué |
| :--- | :--- |
| Llamar `POST /swaps/preview`, `/transfers/preview`, `/pix/payouts/preview` | Crean una transacción pendiente aunque se llamen "preview" |
| Tool que reciba la API key como argumento | La credencial pasaría por el LLM |
| Devolver `counterparty_key`, CVU, alias o direcciones en una tool | Datos bancarios sensibles |
| `BELO_ALLOW_SERVER_CREDENTIAL=true` en producción | Todos los usuarios verían la cuenta del servidor |
| Presentar un score con `uses_dummy_data: true` como evaluación real | Las fuentes dummy son datos sintéticos |
| `BELO_DEMO_PROFILE` en producción | Todos verían una oferta de un perfil sintético (marcada `demo: true`) |
| Usar `civilStatus` o compliance flags como puntos del score | Discriminación / uso indebido |
| Hardcodear CBU/CVU o la API key | Nunca en código ni variables versionadas |

---

## 📊 Flujo de un Request de Crédito

```
Usuario → cliente MCP (header X-Belo-Api-Key)
        → MCP Server (lee la credencial del header)
        → belo API (solo GET, caché 10 min por titular)
        → categorización + features + scorecard (lógica pura)
        → Respuesta: score, banda, razones, oferta simulada
        → Usuario
```

---

## ✅ Checklist Pre-Deploy

- [ ] `grep -r "CBU\|CVU\|PRIVATE_KEY" backend/src` → sin valores hardcodeados
- [ ] `vercel.json` tiene `maxDuration: 30`
- [ ] Env vars de Vercel: `BELO_BASE_URL`, `LOAN_MAX_USD`; **sin** `BELO_ALLOW_SERVER_CREDENTIAL=true` ni `BELO_DEMO_PROFILE`
- [ ] `pytest` pasa (incluye el test de solo-GET y el de salidas sin datos sensibles)
- [ ] MCP Inspector muestra solo las 7 tools de lectura/simulación
- [ ] Frontend: `MCP_SERVER_URL` solo en `route.ts`

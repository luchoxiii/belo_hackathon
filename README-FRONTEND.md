# 🎨 Frontend — Chat UI para Savings Wallet MCP

Interfaz de chat para consultar proyecciones de ahorro, metas y promociones.
El usuario pregunta en lenguaje natural; el frontend conecta al MCP remoto
y hace streaming de la respuesta.

**Stack:** Next.js 15 + AI SDK + Tailwind CSS

---

## 📋 Tabla de Contenidos

1. [Stack](#-stack)
2. [Estructura](#-estructura)
3. [Código completo](#-código-completo)
4. [Variables de entorno](#-variables-de-entorno)
5. [Deploy en Vercel](#-deploy-en-vercel)
6. [Probar localmente](#-probar-localmente)
7. [Guardrails del frontend](#-guardrails-del-frontend)
8. [Troubleshooting](#-troubleshooting)

---

## 📋 Stack

| Componente | Tecnología | Versión |
| :--- | :--- | :--- |
| Framework | Next.js | 15+ |
| React | React | 19+ |
| AI SDK | `ai` | 4+ |
| React hooks | `@ai-sdk/react` | 1+ |
| OpenAI provider | `@ai-sdk/openai` | 1+ |
| MCP client | `@ai-sdk/mcp` | 0.1+ |
| Estilos | Tailwind CSS | 3+ |

---

## 📁 Estructura

```
frontend/
├── app/
│   ├── api/
│   │   └── chat/
│   │       └── route.ts     # Proxy con guardrails
│   ├── page.tsx              # Chat UI
│   ├── layout.tsx            # Root layout
│   └── globals.css           # Tailwind imports
├── .env.local                # OPENAI_API_KEY, MCP_SERVER_URL
├── package.json
├── tailwind.config.ts
└── README-FRONTEND.md        # Este archivo
```

---

## 💻 Código completo

### `package.json`

```json
{
  "name": "savings-wallet-frontend",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "ai": "^4.0.0",
    "@ai-sdk/react": "^1.0.0",
    "@ai-sdk/openai": "^1.0.0",
    "@ai-sdk/mcp": "^0.1.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "tailwindcss": "^3.4.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0"
  }
}
```

### `app/layout.tsx`

```typescript
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Asistente de Ahorro',
  description: 'Proyectá tu ahorro, planificá metas y descubrí promos',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="bg-gray-50 min-h-screen">{children}</body>
    </html>
  );
}
```

### `app/api/chat/route.ts` — Proxy con guardrails

```typescript
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { createMCPClient } from '@ai-sdk/mcp';

export const maxDuration = 60;

// 🛡️ Guardrail: rate limit en memoria (MVP)
const lastRequest = new Map<string, number>();
const RATE_LIMIT_MS = 2000;

export async function POST(req: Request) {
  const { messages, sessionId } = await req.json();

  // 🛡️ Rate limit por sesión
  const now = Date.now();
  const last = lastRequest.get(sessionId) || 0;
  if (now - last < RATE_LIMIT_MS) {
    return new Response(
      JSON.stringify({ error: 'Rate limit: espera 2 segundos' }),
      { status: 429 }
    );
  }
  lastRequest.set(sessionId, now);

  // 🛡️ Validar longitud de conversación
  const totalChars = messages.reduce(
    (sum: number, m: any) => sum + (m.content?.length || 0),
    0
  );
  if (totalChars > 5000) {
    return new Response(
      JSON.stringify({ error: 'Conversación demasiado larga' }),
      { status: 400 }
    );
  }

  // Conectar al MCP remoto
  const mcpClient = await createMCPClient({
    transport: {
      type: 'http',
      url: process.env.MCP_SERVER_URL!,
    },
  });

  const tools = await mcpClient.tools();

  const result = streamText({
    model: openai('gpt-4o-mini'),
    system: `Eres un asistente de ahorro personal en Argentina.
Ayudás al usuario a:
1. Entender si su ahorro le gana a la inflación.
2. Planificar metas (viajes, compras) y ver si alcanza.
3. Descubrir promociones de su billetera que aumenten su ahorro.

NUNCA des consejos de inversión ni sugieras mover fondos.
Solo proyectá con los datos que te da el MCP.`,
    messages,
    tools,
    onFinish: async () => {
      await mcpClient.close();
    },
  });

  return result.toDataStreamResponse();
}
```

### `app/page.tsx` — Chat UI

```typescript
'use client';

import { useChat } from '@ai-sdk/react';
import { useState } from 'react';

export default function ChatPage() {
  const [sessionId] = useState(() => crypto.randomUUID());

  const { messages, input, handleInputChange, handleSubmit, isLoading, error } =
    useChat({
      body: { sessionId },
    });

  return (
    <div className="max-w-2xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-2">💰 Asistente de Ahorro</h1>
      <p className="text-sm text-gray-500 mb-4">
        Proyectá tu ahorro, planificá metas y descubrí promos.
      </p>

      <div className="space-y-4 mb-4 min-h-[300px]">
        {messages.length === 0 && (
          <div className="text-gray-400 text-center py-8">
            <p>Ejemplos:</p>
            <p className="text-sm mt-2">"¿Mi ahorro le gana a la inflación?"</p>
            <p className="text-sm">"Quiero ahorrar $500.000 para un viaje en 10 meses"</p>
            <p className="text-sm">"¿Qué promos tengo en Cuenta DNI?"</p>
          </div>
        )}

        {messages.map((m) => (
          <div
            key={m.id}
            className={m.role === 'user' ? 'text-right' : 'text-left'}
          >
            <span
              className={`inline-block p-3 rounded-lg max-w-[80%] ${
                m.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border text-gray-800'
              }`}
            >
              {m.content}
            </span>
          </div>
        ))}

        {isLoading && (
          <div className="text-left">
            <span className="inline-block p-3 rounded-lg bg-white border text-gray-400">
              Pensando...
            </span>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded mb-4">
          Error: {error.message}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={input}
          onChange={handleInputChange}
          placeholder="¿Mi ahorro le gana a la inflación?"
          className="flex-1 border p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={isLoading}
          maxLength={500}
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="bg-blue-600 text-white px-6 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700"
        >
          Enviar
        </button>
      </form>

      <p className="text-xs text-gray-400 mt-2">
        🛡️ Solo proyecciones. No mueve fondos.
      </p>
    </div>
  );
}
```

### `tailwind.config.ts`

```typescript
import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: { extend: {} },
  plugins: [],
};

export default config;
```

### `app/globals.css`

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

---

## 🔑 Variables de entorno

Crear `.env.local` en `frontend/`:

```env
# OpenAI API Key (obligatoria)
OPENAI_API_KEY=sk-...

# URL del MCP backend (obligatoria)
MCP_SERVER_URL=https://tu-proyecto.vercel.app/mcp
```

### Configurar en Vercel

Dashboard → Settings → Environment Variables:

| Variable | Scope | Requerida |
| :--- | :--- | :--- |
| `OPENAI_API_KEY` | Production, Preview | ✅ |
| `MCP_SERVER_URL` | Production, Preview | ✅ |

---

## 🚀 Deploy en Vercel

### 1. Login

```bash
vercel login
```

### 2. Deploy desde `frontend/`

```bash
cd frontend
vercel --prod
```

### 3. Configurar env vars

```bash
vercel env add OPENAI_API_KEY
vercel env add MCP_SERVER_URL
```

### 4. Redeploy

```bash
vercel --prod
```

### 5. Abrir la URL

Vercel imprime algo como:

```
✅ Production: https://belo-hackathon-frontend.vercel.app
```

---

## 🧪 Probar localmente

```bash
cd frontend
npm install
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000).

Probar:

- *"¿Mi ahorro le gana a la inflación?"* → debe invocar `get_savings_projection`.
- *"Quiero ahorrar \$500.000 para un viaje en 10 meses"* → debe invocar `get_goal_projection`.
- *"¿Qué promos tengo en Cuenta DNI?"* → debe invocar `get_promotions`.

---

## 🛡️ Guardrails del frontend

| Guardrail | Implementación | Riesgo mitigado |
| :--- | :--- | :--- |
| Sanitización | `maxLength={500}` + validación en `route.ts` | Prompt injection |
| Rate limit | 2s entre mensajes por `sessionId` | Abuso de API |
| Timeout visual | `isLoading` muestra "Pensando..." | UX con funciones lentas |
| Secretos | `MCP_SERVER_URL` solo en `route.ts` | Fuga de credenciales |
| System prompt | "NUNCA des consejos de inversión" | Alucinaciones peligrosas |

### 🚫 Anti-patrones prohibidos

```typescript
// ❌ NUNCA hacer esto en el cliente
const response = await fetch(process.env.MCP_SERVER_URL!, {
  // Expone la URL al cliente
});

// ✅ Correcto: la conexión al MCP vive en route.ts del servidor
```

---

## 🔧 Troubleshooting

### ❌ OpenAI API key not found

Verificar `.env.local`:

```env
OPENAI_API_KEY=sk-...
```

Y reiniciar el dev server (`npm run dev`).

### ❌ MCP connection failed

1. Verificar que el backend está desplegado:
   ```bash
   curl https://tu-proyecto.vercel.app/mcp
   ```
2. Verificar que `MCP_SERVER_URL` termina en `/mcp`.

### ❌ Rate limit 429 en el chat

El frontend limita a 1 mensaje cada 2s. Si ves 429, esperar y reintentar.

### ❌ `useChat` no muestra mensajes

1. Verificar que `route.ts` retorna `result.toDataStreamResponse()`.
2. En AI SDK 4+, es `toDataStreamResponse()` (no `toAIStreamResponse()`).

---

## 📚 Referencias

- [Vercel AI SDK](https://sdk.vercel.ai/docs)
- [useChat hook](https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot)
- [@ai-sdk/mcp](https://sdk.vercel.ai/docs/ai-sdk-core/mcp)
- [Next.js App Router](https://nextjs.org/docs/app)

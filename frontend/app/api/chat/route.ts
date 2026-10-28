import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  tool,
  toUIMessageStream,
  type UIMessage,
} from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { parseISO, addMonths, format, differenceInDays } from 'date-fns'
import { z } from 'zod'
import { getBeloBalance } from '@/lib/belo'
import { evaluateExpense, projectBalance } from '@/lib/projection'

// Convert simple message format (with content) to UIMessage format (with parts)
function normalizeMessages(messages: any[]): UIMessage[] {
  return messages.map((msg) => {
    // If message already has parts, return as-is
    if (msg.parts && Array.isArray(msg.parts)) {
      return msg as UIMessage
    }
    // Convert content to parts format
    return {
      id: msg.id,
      role: msg.role,
      parts: [{ type: 'text', text: msg.content || '' }],
    } as UIMessage
  })
}
import {
  DEFAULT_SETTINGS,
  FREQUENCY_LABELS,
  financialEventSchema,
  settingsSchema,
} from '@/lib/types'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

export const maxDuration = 60

const bodySchema = z.object({
  events: z.array(financialEventSchema).max(200).default([]),
  settings: settingsSchema.default(DEFAULT_SETTINGS),
})

function todayInArgentina() {
  const iso = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(
    new Date(),
  )
  return { iso, date: parseISO(iso) }
}

// Helper to load transaction history
type Transaction = {
  id: string
  type: 'credit' | 'debit'
  category: string
  amount: number
  amountArs: number
  description: string
  createdAt: string
  merchant?: string
  investment?: {
    type: string
    rate?: number
    maturityDate?: string
  }
}

type MockData = {
  transactions: Transaction[]
  accounts?: Array<{
    type: string
    currency: string
    balance: { available: number }
  }>
}

// Backend API URL (set in .env.local or defaults to localhost)
const BACKEND_API_URL = process.env.BACKEND_API_URL || 'http://localhost:8000'

async function loadMockData(): Promise<MockData> {
  // Try to fetch from backend first
  try {
    const response = await fetch(`${BACKEND_API_URL}/api/dashboard/transactions`, {
      next: { revalidate: 60 }, // Cache for 1 minute
    })
    if (response.ok) {
      const data = await response.json()
      return {
        transactions: data.transactions || [],
        accounts: data.accounts || [],
      }
    }
  } catch {
    // Backend not available, fall back to static file
  }

  // Fallback to static file
  const dataPath = join(process.cwd(), 'data', 'mock-transactions.json')
  if (!existsSync(dataPath)) return { transactions: [] }
  try {
    const data = JSON.parse(readFileSync(dataPath, 'utf-8'))
    return {
      transactions: data.transactions || [],
      accounts: data.accounts || [],
    }
  } catch {
    return { transactions: [] }
  }
}

// Scoring data types
type ScoringProfile = {
  demo: boolean
  eligible: boolean
  score?: number
  band?: string
  reasons?: string[]
  has_preapproved_offer?: boolean
}

type LoanOffer = {
  band: string
  currency: string
  amount_max_usd: string
  term_months: number
  max_term_months: number
  min_term_months: number
  tna: string
  tea: string
  installment_usd: string
  max_installment_usd: string
  total_payable_usd: string
  valid_until: string
  disclaimer: string
}

type ScoringData = {
  profile: ScoringProfile
  offer: {
    has_offer: boolean
    offer?: LoanOffer
    reasons?: string[]
    demo: boolean
  }
}

// USD to ARS conversion rate (approximate, in real app would be fetched)
const USD_TO_ARS = 1200

async function loadScoringData(): Promise<ScoringData | null> {
  try {
    const response = await fetch(`${BACKEND_API_URL}/api/scoring/profile`, {
      next: { revalidate: 60 },
    })
    if (response.ok) {
      return await response.json()
    }
  } catch {
    // Backend not available
  }
  return null
}

// Get balance from accounts (realistic) instead of summing all transactions
function getAccountBalance(accounts: MockData['accounts']): number {
  if (!accounts || accounts.length === 0) return 0

  // Find ARS checking account balance
  const arsAccount = accounts.find(a => a.type === 'checking' && a.currency === 'ARS')
  const arsBalance = arsAccount?.balance?.available || 0

  // Add USDT converted to ARS (at ~1100 ARS/USD)
  const usdtAccount = accounts.find(a => a.currency === 'USDT')
  const usdtBalance = (usdtAccount?.balance?.available || 0) * 1100

  return arsBalance + usdtBalance
}

// Detect upcoming plazo fijo maturities
function detectPlazoFijoVencimientos(transactions: Transaction[], today: Date) {
  const plazosFijos = transactions.filter(
    tx => tx.category === 'plazo_fijo_constitucion' && tx.investment?.maturityDate
  )

  const upcoming = plazosFijos
    .map(pf => {
      const maturityDate = new Date(pf.investment!.maturityDate!)
      const daysUntil = differenceInDays(maturityDate, today)
      return {
        amount: pf.amountArs,
        rate: pf.investment!.rate || 0,
        maturityDate: pf.investment!.maturityDate!,
        daysUntil,
        description: pf.description,
      }
    })
    .filter(pf => pf.daysUntil >= -7 && pf.daysUntil <= 30) // Recently matured or maturing soon
    .sort((a, b) => a.daysUntil - b.daysUntil)

  return upcoming
}

// Detect recurring expenses that could be scheduled
function detectRecurringExpenses(transactions: Transaction[], today: Date) {
  const sixMonthsAgo = addMonths(today, -6)

  // Group transactions by merchant/description
  const expensePatterns: Record<string, { count: number; avgAmount: number; lastDate: string; merchant: string }> = {}

  transactions
    .filter(tx =>
      tx.type === 'debit' &&
      new Date(tx.createdAt) >= sixMonthsAgo &&
      tx.merchant
    )
    .forEach(tx => {
      const key = tx.merchant || tx.description
      if (!expensePatterns[key]) {
        expensePatterns[key] = { count: 0, avgAmount: 0, lastDate: tx.createdAt, merchant: key }
      }
      expensePatterns[key].count++
      expensePatterns[key].avgAmount =
        (expensePatterns[key].avgAmount * (expensePatterns[key].count - 1) + tx.amountArs) / expensePatterns[key].count
      if (tx.createdAt > expensePatterns[key].lastDate) {
        expensePatterns[key].lastDate = tx.createdAt
      }
    })

  // Find patterns that occur at least 4 times in 6 months (monthly-ish)
  return Object.values(expensePatterns)
    .filter(p => p.count >= 4)
    .map(p => ({
      merchant: p.merchant,
      monthlyCount: p.count / 6,
      avgAmount: Math.round(p.avgAmount),
      lastPayment: p.lastDate,
      suggestion: p.count >= 5 ? 'Agendar débito automático' : 'Considerar automatizar',
    }))
    .sort((a, b) => b.avgAmount - a.avgAmount)
    .slice(0, 10)
}

// Detect annual/sporadic expenses
function detectAnnualExpenses(transactions: Transaction[], today: Date) {
  const oneYearAgo = addMonths(today, -12)
  const twoYearsAgo = addMonths(today, -24)

  // Categories that are typically annual
  const annualCategories = ['matricula_escolar', 'seguro_auto', 'patente', 'impuesto_inmobiliario']

  // Find expenses that appear only once or twice per year
  const expensesByCategory: Record<string, { dates: string[]; amounts: number[]; description: string }> = {}

  transactions
    .filter(tx =>
      tx.type === 'debit' &&
      new Date(tx.createdAt) >= twoYearsAgo
    )
    .forEach(tx => {
      const key = tx.category
      if (!expensesByCategory[key]) {
        expensesByCategory[key] = { dates: [], amounts: [], description: tx.description }
      }
      expensesByCategory[key].dates.push(tx.createdAt)
      expensesByCategory[key].amounts.push(tx.amountArs)
    })

  return Object.entries(expensesByCategory)
    .filter(([category, data]) => {
      // 1-4 occurrences per year suggests annual/quarterly expense
      const occurrencesPerYear = data.dates.length / 2
      return occurrencesPerYear <= 4 && (annualCategories.includes(category) || data.amounts.some(a => a > 200000))
    })
    .map(([category, data]) => {
      const avgAmount = data.amounts.reduce((a, b) => a + b, 0) / data.amounts.length
      const lastDate = data.dates.sort().pop()!
      const nextExpectedDate = addMonths(new Date(lastDate), Math.round(24 / data.dates.length))
      const daysUntil = differenceInDays(nextExpectedDate, today)

      return {
        category,
        description: data.description,
        avgAmount: Math.round(avgAmount),
        frequency: data.dates.length <= 2 ? 'anual' : 'trimestral',
        lastOccurrence: lastDate,
        nextExpected: format(nextExpectedDate, 'yyyy-MM'),
        daysUntilNext: daysUntil,
        shouldProject: daysUntil > 0 && daysUntil < 180,
      }
    })
    .filter(e => e.shouldProject)
    .sort((a, b) => a.daysUntilNext - b.daysUntilNext)
}

// Derive financial events from transaction history
type DerivedEvent = {
  id: string
  type: 'ingreso' | 'gasto'
  name: string
  category: 'Sueldo' | 'Aguinaldo' | 'Alquiler' | 'Servicios' | 'Impuestos' | 'Educación' | 'Otros'
  amount: number
  frequency: 'unico' | 'mensual' | 'bimestral' | 'trimestral' | 'semestral' | 'anual'
  startDate: string
  endDate: string | null
  adjustsForInflation: boolean
}

function deriveEventsFromTransactions(transactions: Transaction[], today: Date): DerivedEvent[] {
  const sixMonthsAgo = addMonths(today, -6)
  const derivedEvents: DerivedEvent[] = []

  // Group transactions by category and type
  const grouped: Record<string, { type: 'credit' | 'debit'; amounts: number[]; count: number; description: string }> = {}

  transactions
    .filter(tx => new Date(tx.createdAt) >= sixMonthsAgo)
    .forEach(tx => {
      const key = `${tx.type}:${tx.category}`
      if (!grouped[key]) {
        grouped[key] = { type: tx.type, amounts: [], count: 0, description: tx.description || tx.category }
      }
      grouped[key].amounts.push(tx.amountArs)
      grouped[key].count++
    })

  // Convert to events (only patterns with 4+ occurrences in 6 months = monthly)
  Object.entries(grouped).forEach(([key, data]) => {
    const [type, category] = key.split(':')
    const avgAmount = data.amounts.reduce((a, b) => a + b, 0) / data.amounts.length
    const monthlyOccurrences = data.count / 6

    // Skip if not recurring enough or too small
    if (monthlyOccurrences < 0.8 || avgAmount < 5000) return

    // Determine frequency
    let frequency: DerivedEvent['frequency'] = 'mensual'
    if (monthlyOccurrences < 0.4) frequency = 'trimestral'
    else if (monthlyOccurrences < 0.2) frequency = 'semestral'

    // Map transaction categories to valid event categories
    const categoryMap: Record<string, DerivedEvent['category']> = {
      salario: 'Sueldo',
      aguinaldo: 'Aguinaldo',
      freelance: 'Sueldo',
      alquiler: 'Alquiler',
      expensas: 'Alquiler',
      luz: 'Servicios',
      gas: 'Servicios',
      agua: 'Servicios',
      internet: 'Servicios',
      telefono: 'Servicios',
      debito_prepaga: 'Servicios',
      cuota_colegio: 'Educación',
      matricula_escolar: 'Educación',
      actividad_extracurricular: 'Educación',
      debito_gimnasio: 'Otros',
      debito_netflix: 'Otros',
      debito_spotify: 'Otros',
      debito_streaming: 'Otros',
      tarjeta_supermercado: 'Otros',
      tarjeta_combustible: 'Otros',
      tarjeta_restaurante: 'Otros',
      seguro_auto: 'Otros',
      impuesto_ganancias: 'Impuestos',
      abl: 'Impuestos',
    }

    // Create readable name
    const nameLabels: Record<string, string> = {
      salario: 'Sueldo',
      aguinaldo: 'Aguinaldo',
      freelance: 'Ingresos freelance',
      alquiler: 'Alquiler',
      expensas: 'Expensas',
      luz: 'Luz',
      gas: 'Gas',
      agua: 'Agua',
      internet: 'Internet',
      telefono: 'Teléfono',
      debito_prepaga: 'Prepaga médica',
      cuota_colegio: 'Cuota colegio',
      debito_gimnasio: 'Gimnasio',
      debito_netflix: 'Netflix',
      debito_spotify: 'Spotify',
      debito_streaming: 'Streaming',
      tarjeta_supermercado: 'Supermercado',
      tarjeta_combustible: 'Combustible',
      tarjeta_restaurante: 'Restaurantes',
      seguro_auto: 'Seguro auto',
      impuesto_ganancias: 'Impuesto ganancias',
    }

    const name = nameLabels[category] || category.replace(/_/g, ' ')
    const eventCategory = categoryMap[category] || 'Otros'

    derivedEvents.push({
      id: `derived-${category}`,
      type: type === 'credit' ? 'ingreso' : 'gasto',
      name,
      category: eventCategory,
      amount: Math.round(avgAmount),
      frequency,
      startDate: format(today, 'yyyy-MM-dd'),
      endDate: null,
      adjustsForInflation: true,
    })
  })

  return derivedEvents
}

// Calculate average monthly net from recent transactions (for projections)
function calculateMonthlyNet(transactions: Transaction[]): number {
  // Use last 6 months of transactions
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

  const recentTx = transactions.filter(tx => new Date(tx.createdAt) >= sixMonthsAgo)
  if (recentTx.length === 0) return 0

  const income = recentTx.filter(tx => tx.type === 'credit').reduce((sum, tx) => sum + tx.amountArs, 0)
  const expenses = recentTx.filter(tx => tx.type === 'debit').reduce((sum, tx) => sum + tx.amountArs, 0)

  return Math.round((income - expenses) / 6)
}

export async function POST(req: Request) {
  let json: any
  try {
    json = await req.json()
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const messages: UIMessage[] = json.messages
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: 'Falta el campo messages' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    return Response.json({ error: 'Solicitud inválida', details: parsed.error.errors }, { status: 400 })
  }

  const { events: userEvents, settings } = parsed.data
  const today = todayInArgentina()

  // Load mock data (transactions + accounts) and scoring data
  const [mockData, scoringData] = await Promise.all([
    loadMockData(),
    loadScoringData(),
  ])
  const transactions = mockData.transactions

  // If user has no events, derive them from transaction history
  const events = userEvents.length > 0
    ? userEvents
    : deriveEventsFromTransactions(transactions, today.date)

  // Get balance from accounts (realistic) or Belo API
  let balance: number
  if (mockData.accounts && mockData.accounts.length > 0) {
    balance = getAccountBalance(mockData.accounts)
  } else if (transactions.length > 0) {
    // Fallback: estimate from monthly average (not sum of all history)
    const monthlyNet = calculateMonthlyNet(transactions)
    balance = Math.max(monthlyNet * 3, 500_000) // Assume ~3 months of savings
  } else {
    const beloBalance = await getBeloBalance()
    balance = beloBalance.amount
  }

  const hasUserEvents = userEvents.length > 0
  const hasDerivedEvents = !hasUserEvents && events.length > 0

  const result = streamText({
    model: anthropic('claude-sonnet-4-5-20250929'),
    instructions: `Sos el asistente financiero de Belo para usuarios en Argentina. Respondés en español rioplatense (voseo), con tono cercano y persuasivo. Tu objetivo es ayudar al usuario a tomar decisiones financieras inteligentes, y cuando corresponda, ofrecerle los **préstamos personales de Belo** como la mejor opción.

Fecha de hoy: ${today.iso}. Moneda: pesos argentinos (ARS). Inflación mensual: ${settings.monthlyInflation}% (~${(Math.pow(1 + settings.monthlyInflation / 100, 12) * 100 - 100).toFixed(0)}% anual).

DATOS DEL USUARIO:
- Saldo actual: $${balance.toLocaleString('es-AR')} ARS
- Eventos financieros: ${events.length} ${hasUserEvents ? '(cargados)' : hasDerivedEvents ? '(inferidos del historial)' : '(sin eventos)'}

TU MENTALIDAD (MUY IMPORTANTE):
Sos un asesor financiero que entiende la realidad argentina:
1. **La inflación es tu enemigo**: Con ${settings.monthlyInflation}% mensual, esperar significa pagar más. Si algo cuesta $1M hoy, en 6 meses cuesta ~$${Math.round(1000000 * Math.pow(1 + settings.monthlyInflation / 100, 6)).toLocaleString('es-AR')}.
2. **El cash es rey**: Gastar todo el efectivo te deja vulnerable. ¿Y si sube el alquiler? ¿Y si hay un gasto médico? Mantener liquidez es clave.
3. **Crédito inteligente > esperar**: Un préstamo de Belo te permite comprar HOY a precio de HOY, mantener tu colchón de seguridad, y pagar en cuotas que se licuan con la inflación.

PRODUCTOS DE BELO QUE PODÉS OFRECER:
- **Préstamo personal Belo**: Aprobación instantánea desde la app, cuotas fijas en pesos que se licuan con la inflación. El monto máximo depende del scoring del usuario (usá "consultarOfertaCredito" para ver su oferta real).
- **Adelanto de sueldo**: Para gastos urgentes menores, hasta el 50% del sueldo.

CÓMO TRABAJÁS:
- Usá SIEMPRE las herramientas para cualquier pregunta sobre finanzas futuras.
- "evaluarGasto" para preguntas tipo "¿puedo comprar X en tal mes?"
- "consultarOfertaCredito" SIEMPRE que vayas a ofrecer un préstamo, para dar montos y cuotas REALES basados en el scoring del usuario.
- Si el usuario no da monto o mes, pedilo.

CÓMO INTERPRETAR "evaluarGasto":
La herramienta devuelve:
- **canAfford**: Si puede pagar en cash sin quedar en negativo
- **maxAffordableTodayPesos**: Máximo que puede gastar ese mes
- **lowestBalanceAfter**: Saldo mínimo después del gasto
- **installmentOptions**: Opciones de 3, 6 y 12 cuotas con viabilidad
- **upcomingLargeExpenses**: Gastos grandes próximos (matrícula, renovación alquiler, etc.)
- **betterMonths**: Meses alternativos si no puede ahora
- **financingRecommendation**: 'cash' | 'cuotas_recomendado' | 'cuotas_necesario' | 'credito' | 'ahorrar'

=== CÓMO RESPONDER SEGÚN EL CASO ===

**CASO 1: PUEDE PAGAR EN CASH (canAfford=true)**
Aún así, evaluá si le CONVIENE pagar en cash:

Si lowestBalanceAfter < $500.000 o hay upcomingLargeExpenses:
"Sí, técnicamente podés pagarlo en cash... pero te cuento por qué NO te conviene:
- Te quedarías con solo $X de colchón
- En [mes] tenés [gasto importante] que te puede complicar
- Si surge un imprevisto, no tenés margen

**Mi recomendación**: Sacá un **préstamo Belo** y pagalo en [6/12] cuotas de $X. Así:
✓ Comprás HOY a precio de HOY (antes de que suba)
✓ Mantenés tu liquidez para imprevistos
✓ Las cuotas fijas se licuan con la inflación del ${settings.monthlyInflation}% mensual"

Si tiene buen margen (lowestBalanceAfter > $800.000) y no hay gastos grandes:
"Sí, podés comprarlo en cash sin problemas. Te quedarían $X de margen.
Igual te dejo la opción: con un **préstamo Belo** podrías mantener ese cash líquido y pagar cuotas de $Y que se licuan con la inflación."

**CASO 2: NO PUEDE EN CASH PERO SÍ EN CUOTAS (canAfford=false, installmentOptions viable)**
"En cash no llegás, te faltarían ~$[diferencia]. PERO tengo buenas noticias:

Con un **préstamo personal de Belo** podés comprarlo ahora:
- 6 cuotas de $X ✓
- 12 cuotas de $Y ✓

**¿Por qué te conviene hacerlo ahora?**
Hoy la moto/notebook/etc cuesta $Z. Si esperás a [mes que sí llega], con la inflación del ${settings.monthlyInflation}% mensual, va a costar ~$[precio inflado]. O sea, esperando perdés $[diferencia].

Además, las cuotas fijas en pesos se licuan: la cuota de $X hoy, en 6 meses representa menos poder adquisitivo.

¿Querés que te muestre cómo solicitarlo desde la app?"

**CASO 3: NO PUEDE NI EN CUOTAS, PERO ESTÁ CERCA (<30%)**
"Mmm, estás cerca pero no llegás. Te faltarían ~$X (un ${Math.round(settings.monthlyInflation)}% del precio).

Opciones:
1. **Préstamo Belo + algo de ahorro**: Si podés juntar $[parte], el resto lo cubrís con un préstamo y pagás cuotas manejables de $Y
2. **Buscar algo un toque más económico**: Tu presupuesto actual es de hasta $[maxAffordable]
3. **Esperar a [mejor mes]**: Pero ojo, con la inflación el precio sube ~${settings.monthlyInflation}% por mes

¿Qué te cierra más?"

**CASO 4: ESTÁ LEJOS (>30% gap)**
"Uf, para [el gasto] necesitás $X y hoy tu presupuesto es de $Y. Está un poco lejos.

Te propongo un plan:
1. **Meta de ahorro**: Si guardás $Z por mes, en [N] meses llegás
2. **Opción más accesible**: Con $[maxAffordable] podés conseguir [alternativa más barata]
3. **Esperar al aguinaldo**: En [mes con aguinaldo] tu situación mejora bastante

¿Arrancamos un plan de ahorro?"

=== MUY IMPORTANTE: ANTES DE OFRECER CRÉDITO ===
SIEMPRE llamá a "consultarOfertaCredito" para obtener los montos y tasas REALES del usuario.
La herramienta devuelve:
- montoMaximoARS: El monto máximo que puede pedir
- cuotaMensualARS: La cuota mensual para el plazo dado
- tasaNominalAnual y tasaEfectivaAnual: Las tasas reales
- plazoMinimo y plazoMaximo: Plazos disponibles

Usá ESTOS DATOS REALES al responder, no inventes montos.

=== ARGUMENTOS DE VENTA DEL CRÉDITO BELO ===
Usá estos argumentos cuando ofrezcas el préstamo:

1. **Inflación a tu favor**: "Las cuotas son fijas en pesos. Con inflación del ${settings.monthlyInflation}% mensual, lo que hoy son $100.000 de cuota, en 6 meses equivalen a mucho menos en poder de compra."

2. **Precio de hoy vs mañana**: "Ese [producto] hoy cuesta $X. En [N meses] va a costar ~$[precio inflado]. Comprándolo ahora con crédito, te ahorrás esa diferencia."

3. **Liquidez = tranquilidad**: "Si gastás todo tu cash, quedás expuesto. ¿Y si el dueño te aumenta el alquiler? ¿Y si se rompe algo en casa? Con el préstamo mantenés tu colchón."

4. **Aprobación instantánea**: "Lo podés sacar ahora mismo desde la app de Belo, sin papeles ni burocracia."

=== FORMATO DE RESPUESTA ===
- Usá **negritas** para montos y productos Belo
- Usá ✓ y ✗ para indicar opciones viables/no viables
- Sé directo pero amigable, como un amigo que sabe de finanzas
- SIEMPRE terminá con una pregunta o llamado a la acción
- Formateá montos como $1.250.000
- No uses tablas ni títulos con #

=== HERRAMIENTAS ADICIONALES ===
- "detectarVencimientosPlazoFijo": Para ofrecer renovación de plazos fijos
- "analizarGastosRecurrentes": Para sugerir automatizar pagos
- "detectarGastosAnuales": Para alertar sobre gastos esporádicos próximos`,
    messages: await convertToModelMessages(normalizeMessages(messages)),
    stopWhen: isStepCount(6),
    tools: {
      obtenerSituacionActual: tool({
        description:
          'Devuelve el saldo actual, la inflación mensual configurada y la lista de eventos financieros cargados por el usuario.',
        inputSchema: z.object({}),
        execute: async () => ({
          hoy: today.iso,
          saldoActualARS: balance,
          inflacionMensualPct: settings.monthlyInflation,
          eventos: events.map((e) => ({
            nombre: e.name,
            tipo: e.type,
            categoria: e.category,
            montoHoyARS: e.amount,
            frecuencia: FREQUENCY_LABELS[e.frequency],
            inicio: e.startDate,
            fin: e.endDate,
            ajustaPorInflacion: e.adjustsForInflation,
          })),
        }),
      }),
      proyectarSaldo: tool({
        description:
          'Proyecta el saldo mes a mes (ingresos, gastos y saldo al cierre) considerando los eventos cargados y la inflación.',
        inputSchema: z.object({
          months: z.number().int().min(1).max(36).describe('Cantidad de meses a proyectar desde hoy'),
        }),
        execute: async ({ months }) => {
          const projection = projectBalance({
            startBalance: balance,
            events,
            settings,
            months,
            today: today.date,
          })
          return {
            saldoInicialARS: projection.startBalance,
            meses: projection.months,
            saldoMinimo: projection.minBalance,
            saldoFinalARS: projection.endBalance,
          }
        },
      }),
      evaluarGasto: tool({
        description:
          'Evalúa si el usuario puede afrontar un gasto puntual (vacaciones, compra, etc.) en un mes determinado sin quedar en saldo negativo en ningún mes posterior.',
        inputSchema: z.object({
          description: z.string().describe('Qué se quiere pagar, ej. "Vacaciones"'),
          amountTodayPesos: z
            .number()
            .positive()
            .describe('Monto del gasto en pesos argentinos de HOY'),
          month: z
            .string()
            .regex(/^\d{4}-\d{2}$/)
            .describe('Mes en que se haría el gasto, formato yyyy-MM'),
          adjustForInflation: z
            .boolean()
            .default(true)
            .describe('Si el monto debe ajustarse por inflación hasta ese mes'),
        }),
        execute: async ({ description, amountTodayPesos, month, adjustForInflation }) => {
          const evaluation = evaluateExpense({
            startBalance: balance,
            events,
            settings,
            targetMonth: month,
            amountTodayPesos,
            adjustForInflation,
            today: today.date,
          })
          return { description, ...evaluation }
        },
      }),
      detectarVencimientosPlazoFijo: tool({
        description:
          'Detecta plazos fijos que están por vencer o vencieron recientemente. Usá esta herramienta para sugerir al usuario renovar sus inversiones.',
        inputSchema: z.object({}),
        execute: async () => {
          const vencimientos = detectPlazoFijoVencimientos(transactions, today.date)
          if (vencimientos.length === 0) {
            return {
              hayVencimientos: false,
              mensaje: 'No hay plazos fijos próximos a vencer.',
            }
          }
          return {
            hayVencimientos: true,
            vencimientos: vencimientos.map(v => ({
              monto: v.amount,
              tasa: v.rate,
              fechaVencimiento: v.maturityDate,
              diasHastaVencimiento: v.daysUntil,
              estado: v.daysUntil < 0 ? 'vencido' : v.daysUntil === 0 ? 'vence hoy' : 'próximo a vencer',
              accionSugerida: v.daysUntil <= 0
                ? 'Renovar ahora desde la app de Belo (capital + intereses o solo capital)'
                : 'Preparar renovación cuando venza',
            })),
          }
        },
      }),
      analizarGastosRecurrentes: tool({
        description:
          'Analiza el historial de gastos para identificar pagos que se repiten mensualmente y podrían automatizarse con débito automático o transferencias programadas.',
        inputSchema: z.object({}),
        execute: async () => {
          const recurrentes = detectRecurringExpenses(transactions, today.date)
          if (recurrentes.length === 0) {
            return {
              hayPatrones: false,
              mensaje: 'No se detectaron gastos recurrentes significativos.',
            }
          }
          return {
            hayPatrones: true,
            gastosRecurrentes: recurrentes.map(g => ({
              comercio: g.merchant,
              frecuenciaMensual: Math.round(g.monthlyCount * 10) / 10,
              promedioMensual: g.avgAmount,
              ultimoPago: g.lastPayment,
              sugerencia: g.suggestion,
            })),
            recomendacion: 'Para estos gastos frecuentes, considerá configurar débitos automáticos o transferencias programadas desde la app de Belo para evitar olvidos.',
          }
        },
      }),
      detectarGastosAnuales: tool({
        description:
          'Detecta gastos que ocurren de forma esporádica (anuales, trimestrales) y podrían proyectarse para mejor planificación financiera.',
        inputSchema: z.object({}),
        execute: async () => {
          const anuales = detectAnnualExpenses(transactions, today.date)
          if (anuales.length === 0) {
            return {
              hayGastosAnuales: false,
              mensaje: 'No se detectaron gastos anuales o trimestrales significativos próximos.',
            }
          }
          return {
            hayGastosAnuales: true,
            gastosEsporadicos: anuales.map(g => ({
              categoria: g.category,
              descripcion: g.description,
              montoPromedio: g.avgAmount,
              frecuencia: g.frequency,
              proximaOcurrencia: g.nextExpected,
              diasHastaProximo: g.daysUntilNext,
            })),
            recomendacion: 'Te sugiero cargar estos gastos como eventos financieros para que las proyecciones sean más precisas. ¿Querés que te ayude a agregarlos?',
          }
        },
      }),
      consultarOfertaCredito: tool({
        description:
          'Consulta la oferta de préstamo preaprobada del usuario basada en su scoring crediticio. Usá esta herramienta SIEMPRE antes de ofrecer un crédito para dar montos y tasas reales.',
        inputSchema: z.object({
          plazoMeses: z.number().int().min(3).max(12).optional().describe('Plazo deseado en meses (3-12). Si no se especifica, usa el plazo máximo disponible.'),
        }),
        execute: async ({ plazoMeses }) => {
          if (!scoringData) {
            return {
              disponible: false,
              mensaje: 'No pudimos consultar tu scoring crediticio en este momento. Probá de nuevo en unos minutos.',
            }
          }

          const { profile, offer } = scoringData

          if (!profile.eligible) {
            return {
              disponible: false,
              elegible: false,
              motivos: profile.reasons || ['No cumple los requisitos mínimos'],
              mensaje: 'Actualmente no calificás para un préstamo preaprobado.',
            }
          }

          if (!offer.has_offer || !offer.offer) {
            return {
              disponible: false,
              elegible: true,
              score: profile.score,
              banda: profile.band,
              motivos: offer.reasons || ['Capacidad de pago insuficiente'],
              mensaje: 'Aunque tu perfil es elegible, no hay una oferta disponible en este momento.',
            }
          }

          const o = offer.offer
          const montoMaxUSD = parseFloat(o.amount_max_usd)
          const cuotaUSD = parseFloat(o.installment_usd)
          const montoMaxARS = Math.round(montoMaxUSD * USD_TO_ARS)
          const cuotaARS = Math.round(cuotaUSD * USD_TO_ARS)

          return {
            disponible: true,
            elegible: true,
            score: profile.score,
            banda: profile.band,
            oferta: {
              montoMaximoUSD: montoMaxUSD,
              montoMaximoARS: montoMaxARS,
              plazoMeses: o.term_months,
              plazoMinimo: o.min_term_months,
              plazoMaximo: o.max_term_months,
              tasaNominalAnual: `${(parseFloat(o.tna) * 100).toFixed(1)}%`,
              tasaEfectivaAnual: `${(parseFloat(o.tea) * 100).toFixed(1)}%`,
              cuotaMensualUSD: cuotaUSD,
              cuotaMensualARS: cuotaARS,
              totalAPagarUSD: parseFloat(o.total_payable_usd),
              totalAPagarARS: Math.round(parseFloat(o.total_payable_usd) * USD_TO_ARS),
              validoHasta: o.valid_until,
            },
            disclaimer: o.disclaimer,
            esDemo: offer.demo,
          }
        },
      }),
    },
  })

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      onError: (error) => {
        console.error('[chat] stream error:', error)
        return 'No pude consultar al modelo en este momento. Probá de nuevo en unos segundos.'
      },
    }),
  })
}

import { NextRequest, NextResponse } from 'next/server'

// Transaction type from backend
type Transaction = {
  id: string
  type: 'credit' | 'debit'
  category: string
  amount: number
  amountArs: number
  description: string
  createdAt: string
  merchant?: string
}

type MockDataset = {
  transactions: Transaction[]
}

const BACKEND_API_URL = process.env.BACKEND_API_URL || 'http://localhost:8000'

let cachedDataset: MockDataset | null = null
let cacheTime: number = 0
const CACHE_TTL = 60 * 1000 // 1 minute cache

async function loadDataset(): Promise<MockDataset | null> {
  // Return cached if fresh
  if (cachedDataset && Date.now() - cacheTime < CACHE_TTL) {
    return cachedDataset
  }

  try {
    const response = await fetch(`${BACKEND_API_URL}/api/dashboard/transactions`, {
      next: { revalidate: 60 },
    })
    if (response.ok) {
      const data = await response.json()
      cachedDataset = { transactions: data.transactions || [] }
      cacheTime = Date.now()
      return cachedDataset
    }
  } catch (error) {
    console.error('[Month API] Error fetching from backend:', error)
  }

  return cachedDataset // Return stale cache if available
}

const CATEGORY_LABELS: Record<string, string> = {
  salario: 'Salario',
  aguinaldo: 'Aguinaldo',
  freelance: 'Freelance',
  alquiler: 'Alquiler',
  expensas: 'Expensas',
  luz: 'Luz',
  gas: 'Gas',
  agua: 'Agua',
  internet: 'Internet',
  telefono: 'Teléfono',
  tarjeta_supermercado: 'Supermercado',
  tarjeta_farmacia: 'Farmacia',
  tarjeta_restaurante: 'Restaurantes',
  tarjeta_combustible: 'Combustible',
  tarjeta_indumentaria: 'Ropa',
  tarjeta_tecnologia: 'Tecnología',
  tarjeta_entretenimiento: 'Entretenimiento',
  debito_prepaga: 'Prepaga/Salud',
  debito_netflix: 'Netflix',
  debito_spotify: 'Spotify',
  debito_streaming: 'Streaming',
  debito_gimnasio: 'Gimnasio',
  cuota_colegio: 'Colegio',
  matricula_escolar: 'Matrícula',
  utiles_escolares: 'Útiles escolares',
  actividad_extracurricular: 'Actividades',
  compra_crypto: 'Compra Crypto',
  venta_crypto: 'Venta Crypto',
  plazo_fijo_constitucion: 'Plazo Fijo (const.)',
  plazo_fijo_vencimiento: 'Plazo Fijo (venc.)',
  interes_plazo_fijo: 'Intereses PF',
  seguro_auto: 'Seguro Auto',
  mantenimiento_auto: 'Mantenimiento Auto',
  peaje: 'Peajes',
  uber_taxi: 'Uber/Taxi',
  impuesto_ganancias: 'Imp. Ganancias',
  abl: 'ABL',
  pediatra: 'Pediatra',
  medico: 'Médico',
}

// Calcular promedios históricos por categoría para proyecciones
function calculateMonthlyAverages(transactions: Transaction[]) {
  const byMonthCategory: Record<string, Record<string, { total: number; count: number }>> = {}

  for (const tx of transactions) {
    const month = tx.createdAt.substring(0, 7)
    if (!byMonthCategory[month]) byMonthCategory[month] = {}
    if (!byMonthCategory[month][tx.category]) {
      byMonthCategory[month][tx.category] = { total: 0, count: 0 }
    }
    byMonthCategory[month][tx.category].total += tx.amountArs
    byMonthCategory[month][tx.category].count++
  }

  // Calcular promedio por categoría
  const categoryTotals: Record<string, { total: number; months: number }> = {}
  for (const monthData of Object.values(byMonthCategory)) {
    for (const [cat, data] of Object.entries(monthData)) {
      if (!categoryTotals[cat]) categoryTotals[cat] = { total: 0, months: 0 }
      categoryTotals[cat].total += data.total
      categoryTotals[cat].months++
    }
  }

  const averages: Record<string, number> = {}
  for (const [cat, data] of Object.entries(categoryTotals)) {
    averages[cat] = Math.round(data.total / data.months)
  }

  return averages
}

// Generar proyección para un mes futuro
function projectMonth(averages: Record<string, number>, targetMonth: string, inflationRate: number = 0.04) {
  const now = new Date()
  const target = new Date(targetMonth + '-01')
  const monthsAhead = (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth())

  if (monthsAhead <= 0) return null // No es futuro

  const inflationFactor = Math.pow(1 + inflationRate, monthsAhead)

  const projected: Array<{
    category: string
    label: string
    type: 'credit' | 'debit'
    amount: number
    isProjected: true
    confidence: 'high' | 'medium' | 'low'
  }> = []

  // Categorías de gastos fijos (alta confianza)
  const fixedExpenses = ['alquiler', 'expensas', 'cuota_colegio', 'debito_prepaga', 'debito_netflix', 'debito_spotify', 'debito_gimnasio', 'seguro_auto']
  // Categorías variables (media confianza)
  const variableExpenses = ['tarjeta_supermercado', 'tarjeta_combustible', 'luz', 'gas', 'agua', 'internet', 'telefono']
  // Categorías esporádicas (baja confianza)
  const sporadicExpenses = ['tarjeta_restaurante', 'tarjeta_indumentaria', 'tarjeta_tecnologia', 'compra_crypto']
  // Ingresos
  const incomeCategories = ['salario', 'aguinaldo']

  for (const [cat, avg] of Object.entries(averages)) {
    const adjustedAmount = Math.round(avg * inflationFactor)
    let confidence: 'high' | 'medium' | 'low' = 'low'
    let type: 'credit' | 'debit' = 'debit'

    if (incomeCategories.includes(cat)) {
      type = 'credit'
      confidence = 'high'
      // Aguinaldo solo en junio y diciembre
      if (cat === 'aguinaldo') {
        const month = target.getMonth()
        if (month !== 5 && month !== 11) continue
      }
    } else if (fixedExpenses.includes(cat)) {
      confidence = 'high'
    } else if (variableExpenses.includes(cat)) {
      confidence = 'medium'
    } else if (sporadicExpenses.includes(cat)) {
      confidence = 'low'
    }

    projected.push({
      category: cat,
      label: CATEGORY_LABELS[cat] || cat,
      type,
      amount: adjustedAmount,
      isProjected: true,
      confidence,
    })
  }

  return projected.sort((a, b) => b.amount - a.amount)
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ month: string }> }
) {
  const { month } = await params

  // Validar formato yyyy-MM
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'Formato inválido. Usar yyyy-MM' }, { status: 400 })
  }

  const dataset = await loadDataset()
  if (!dataset || dataset.transactions.length === 0) {
    return NextResponse.json({ error: 'Dataset no encontrado. Verificá que el backend esté corriendo.' }, { status: 404 })
  }

  // Parse month correctly to avoid timezone issues
  const [yearStr, monthStr] = month.split('-')
  const year = parseInt(yearStr, 10)
  const monthNum = parseInt(monthStr, 10) - 1 // 0-indexed
  const targetDate = new Date(year, monthNum, 1)
  const now = new Date()
  const isFuture = targetDate > now
  const isPast = targetDate < new Date(now.getFullYear(), now.getMonth(), 1)

  // Generate label correctly
  const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  const monthLabel = `${MONTH_NAMES[monthNum]} de ${year}`

  // Datos del mes (si existe)
  const monthTransactions = dataset.transactions.filter(
    tx => tx.createdAt.startsWith(month)
  )

  // Calcular promedios para proyecciones
  const averages = calculateMonthlyAverages(dataset.transactions)

  if (isFuture) {
    // Proyección futura basada en promedios históricos
    const monthsAhead = (targetDate.getFullYear() - now.getFullYear()) * 12 + (targetDate.getMonth() - now.getMonth())
    const inflationRate = 0.04 // 4% mensual
    const inflationFactor = Math.pow(1 + inflationRate, monthsAhead)

    // Proyectar cada categoría
    const projected: Array<{
      category: string
      label: string
      type: 'credit' | 'debit'
      amount: number
      isProjected: boolean
      confidence: 'high' | 'medium' | 'low'
    }> = []

    const fixedExpenses = ['alquiler', 'expensas', 'cuota_colegio', 'debito_prepaga', 'debito_netflix', 'debito_spotify', 'debito_gimnasio', 'seguro_auto']
    const variableExpenses = ['tarjeta_supermercado', 'tarjeta_combustible', 'luz', 'gas', 'agua', 'internet', 'telefono']
    const incomeCategories = ['salario', 'freelance']

    for (const [cat, avg] of Object.entries(averages)) {
      if (avg <= 0) continue

      const adjustedAmount = Math.round(avg * inflationFactor)
      let confidence: 'high' | 'medium' | 'low' = 'low'
      let type: 'credit' | 'debit' = 'debit'

      if (incomeCategories.includes(cat)) {
        type = 'credit'
        confidence = 'high'
      } else if (fixedExpenses.includes(cat)) {
        confidence = 'high'
      } else if (variableExpenses.includes(cat)) {
        confidence = 'medium'
      }

      projected.push({
        category: cat,
        label: CATEGORY_LABELS[cat] || cat,
        type,
        amount: adjustedAmount,
        isProjected: true,
        confidence,
      })
    }

    const totalIncome = projected.filter(p => p.type === 'credit').reduce((sum, p) => sum + p.amount, 0)
    const totalExpenses = projected.filter(p => p.type === 'debit').reduce((sum, p) => sum + p.amount, 0)

    return NextResponse.json({
      month,
      label: monthLabel,
      type: 'projection',
      summary: {
        totalIncome,
        totalExpenses,
        net: totalIncome - totalExpenses,
        transactionCount: projected.length,
      },
      breakdown: {
        income: projected.filter(p => p.type === 'credit').sort((a, b) => b.amount - a.amount),
        expenses: projected.filter(p => p.type === 'debit').sort((a, b) => b.amount - a.amount),
      },
      comparison: {
        vsAverage: {
          income: 0,
          expenses: 0,
        },
      },
      note: `Proyección basada en tu historial (${Object.keys(averages).length} categorías). Inflación estimada: ${(inflationRate * 100).toFixed(0)}% mensual.`,
    })
  }

  // Mes pasado o actual - datos reales
  const income = monthTransactions.filter(tx => tx.type === 'credit')
  const expenses = monthTransactions.filter(tx => tx.type === 'debit')

  const totalIncome = income.reduce((sum, tx) => sum + tx.amountArs, 0)
  const totalExpenses = expenses.reduce((sum, tx) => sum + tx.amountArs, 0)

  // Agrupar por categoría
  const expensesByCategory: Record<string, { total: number; count: number; transactions: Transaction[] }> = {}
  for (const tx of expenses) {
    if (!expensesByCategory[tx.category]) {
      expensesByCategory[tx.category] = { total: 0, count: 0, transactions: [] }
    }
    expensesByCategory[tx.category].total += tx.amountArs
    expensesByCategory[tx.category].count++
    expensesByCategory[tx.category].transactions.push(tx)
  }

  const incomeByCategory: Record<string, { total: number; count: number; transactions: Transaction[] }> = {}
  for (const tx of income) {
    if (!incomeByCategory[tx.category]) {
      incomeByCategory[tx.category] = { total: 0, count: 0, transactions: [] }
    }
    incomeByCategory[tx.category].total += tx.amountArs
    incomeByCategory[tx.category].count++
    incomeByCategory[tx.category].transactions.push(tx)
  }

  // Comparar con promedio
  const avgIncome = Object.entries(averages)
    .filter(([cat]) => ['salario', 'aguinaldo', 'freelance'].includes(cat))
    .reduce((sum, [, val]) => sum + val, 0)
  const avgExpenses = Object.entries(averages)
    .filter(([cat]) => !['salario', 'aguinaldo', 'freelance', 'venta_crypto', 'plazo_fijo_vencimiento', 'interes_plazo_fijo'].includes(cat))
    .reduce((sum, [, val]) => sum + val, 0)

  return NextResponse.json({
    month,
    label: monthLabel,
    type: 'historical',
    summary: {
      totalIncome,
      totalExpenses,
      net: totalIncome - totalExpenses,
      transactionCount: monthTransactions.length,
    },
    breakdown: {
      income: Object.entries(incomeByCategory)
        .map(([cat, data]) => ({
          category: cat,
          label: CATEGORY_LABELS[cat] || cat,
          amount: data.total,
          count: data.count,
          transactions: data.transactions.map(tx => ({
            id: tx.id,
            description: tx.description,
            amount: tx.amountArs,
            date: tx.createdAt,
            merchant: tx.merchant,
          })),
        }))
        .sort((a, b) => b.amount - a.amount),
      expenses: Object.entries(expensesByCategory)
        .map(([cat, data]) => ({
          category: cat,
          label: CATEGORY_LABELS[cat] || cat,
          amount: data.total,
          count: data.count,
          transactions: data.transactions.map(tx => ({
            id: tx.id,
            description: tx.description,
            amount: tx.amountArs,
            date: tx.createdAt,
            merchant: tx.merchant,
          })),
        }))
        .sort((a, b) => b.amount - a.amount),
    },
    comparison: {
      vsAverage: {
        income: totalIncome - avgIncome,
        incomePercent: avgIncome > 0 ? Math.round((totalIncome / avgIncome - 1) * 100) : 0,
        expenses: totalExpenses - avgExpenses,
        expensesPercent: avgExpenses > 0 ? Math.round((totalExpenses / avgExpenses - 1) * 100) : 0,
      },
    },
  })
}

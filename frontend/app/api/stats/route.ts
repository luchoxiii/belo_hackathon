import { NextResponse } from 'next/server'

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

type Account = {
  type: string
  currency: string
  balance: { available: number }
}

type MockDataset = {
  transactions: Transaction[]
  accounts?: Account[]
  profile?: { name: string }
  stats?: {
    averageMonthlyIncome: number
    averageMonthlyExpenses: number
  }
}

const BACKEND_API_URL = process.env.BACKEND_API_URL || 'http://localhost:8000'

let cachedDataset: MockDataset | null = null
let cacheTime: number = 0
const CACHE_TTL = 60 * 1000

async function loadDataset(): Promise<MockDataset | null> {
  if (cachedDataset && Date.now() - cacheTime < CACHE_TTL) {
    return cachedDataset
  }

  try {
    const response = await fetch(`${BACKEND_API_URL}/api/dashboard/transactions`, {
      next: { revalidate: 60 },
    })
    if (response.ok) {
      const data = await response.json()
      const transactions = data.transactions || []

      // Calculate stats from transactions
      const monthlyData: Record<string, { income: number; expenses: number }> = {}
      for (const tx of transactions) {
        const month = tx.createdAt.substring(0, 7)
        if (!monthlyData[month]) monthlyData[month] = { income: 0, expenses: 0 }
        if (tx.type === 'credit') {
          monthlyData[month].income += tx.amountArs
        } else {
          monthlyData[month].expenses += tx.amountArs
        }
      }
      const months = Object.values(monthlyData)
      const avgIncome = months.length > 0 ? months.reduce((s, m) => s + m.income, 0) / months.length : 0
      const avgExpenses = months.length > 0 ? months.reduce((s, m) => s + m.expenses, 0) / months.length : 0

      cachedDataset = {
        transactions,
        accounts: data.accounts || [],
        profile: data.profile || { name: 'Usuario' },
        stats: {
          averageMonthlyIncome: avgIncome,
          averageMonthlyExpenses: avgExpenses,
        },
      }
      cacheTime = Date.now()
      return cachedDataset
    }
  } catch (error) {
    console.error('[Stats API] Error fetching from backend:', error)
  }

  return cachedDataset
}

function groupByMonth(transactions: Transaction[]) {
  const groups: Record<string, { income: number; expenses: number; transactions: Transaction[] }> = {}

  for (const tx of transactions) {
    const month = tx.createdAt.substring(0, 7)
    if (!groups[month]) {
      groups[month] = { income: 0, expenses: 0, transactions: [] }
    }
    groups[month].transactions.push(tx)
    if (tx.type === 'credit') {
      groups[month].income += tx.amountArs
    } else {
      groups[month].expenses += tx.amountArs
    }
  }

  return groups
}

function groupByCategory(transactions: Transaction[]) {
  const groups: Record<string, { total: number; count: number }> = {}

  for (const tx of transactions) {
    if (tx.type === 'debit') {
      if (!groups[tx.category]) {
        groups[tx.category] = { total: 0, count: 0 }
      }
      groups[tx.category].total += tx.amountArs
      groups[tx.category].count++
    }
  }

  return groups
}

function calculateDailyBalance(transactions: Transaction[], initialBalance: number = 2_500_000) {
  const byDay: Record<string, { income: number; expenses: number }> = {}

  for (const tx of transactions) {
    const date = tx.createdAt.split('T')[0]
    if (!byDay[date]) {
      byDay[date] = { income: 0, expenses: 0 }
    }
    if (tx.type === 'credit') {
      byDay[date].income += tx.amountArs
    } else {
      byDay[date].expenses += tx.amountArs
    }
  }

  const sortedDays = Object.entries(byDay).sort((a, b) => a[0].localeCompare(b[0]))
  const result: Array<{ date: string; balance: number }> = []
  let balance = initialBalance

  for (const [date, { income, expenses }] of sortedDays) {
    balance = balance + income - expenses
    result.push({ date, balance })
  }

  return result
}

// Nombres más amigables para las categorías
const CATEGORY_LABELS: Record<string, string> = {
  salario: 'Salario',
  aguinaldo: 'Aguinaldo',
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
  debito_prepaga: 'Prepaga/Salud',
  debito_netflix: 'Netflix',
  debito_spotify: 'Spotify',
  debito_streaming: 'Streaming',
  debito_gimnasio: 'Gimnasio',
  cuota_colegio: 'Colegio',
  matricula_escolar: 'Matrícula',
  actividad_extracurricular: 'Actividades',
  compra_crypto: 'Crypto',
  plazo_fijo_constitucion: 'Plazo Fijo',
  seguro_auto: 'Seguro Auto',
  mantenimiento_auto: 'Mantenimiento',
  peaje: 'Peajes',
  impuesto_ganancias: 'Ganancias',
  abl: 'ABL',
}

export async function GET() {
  const dataset = await loadDataset()

  if (!dataset || dataset.transactions.length === 0) {
    return NextResponse.json(
      { error: 'Dataset not found. Run: npm run generate-mock-data' },
      { status: 404 }
    )
  }

  const { transactions, profile, accounts = [], stats } = dataset
  const safeProfile = profile || { name: 'Usuario', familyMembers: [] }
  const safeStats = {
    averageMonthlyIncome: stats?.averageMonthlyIncome || 0,
    averageMonthlyExpenses: stats?.averageMonthlyExpenses || 0,
    totalTransactions: transactions.length,
    totalIncome: transactions.filter(t => t.type === 'credit').reduce((s, t) => s + t.amountArs, 0),
    totalExpenses: transactions.filter(t => t.type === 'debit').reduce((s, t) => s + t.amountArs, 0),
  }

  // Datos mensuales para el gráfico de barras
  const monthlyData = groupByMonth(transactions)
  const monthlyChart = Object.entries(monthlyData)
    .map(([month, data]) => ({
      month,
      label: new Date(month + '-01').toLocaleDateString('es-AR', { month: 'short', year: '2-digit' }),
      income: Math.round(data.income),
      expenses: Math.round(data.expenses),
      net: Math.round(data.income - data.expenses),
    }))
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-12) // Últimos 12 meses

  // Gastos por categoría para el donut
  const categoryData = groupByCategory(transactions)
  const categoryChart = Object.entries(categoryData)
    .map(([category, data]) => ({
      category,
      label: CATEGORY_LABELS[category] || category,
      value: Math.round(data.total),
      count: data.count,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10) // Top 10 categorías

  // Balance diario para el gráfico de línea (últimos 90 días)
  const recentTransactions = transactions.filter(tx => {
    const txDate = new Date(tx.createdAt)
    const ninetyDaysAgo = new Date()
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
    return txDate >= ninetyDaysAgo
  })
  const balanceChart = calculateDailyBalance(recentTransactions)
    .filter((_, i, arr) => i % 3 === 0 || i === arr.length - 1) // Cada 3 días para reducir puntos

  // Transacciones recientes
  const recent = [...transactions]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 15)
    .map(tx => ({
      ...tx,
      categoryLabel: CATEGORY_LABELS[tx.category] || tx.category,
    }))

  // Calcular saldo actual sumando todas las transacciones
  const currentBalance = accounts.find(a => a.currency === 'ARS')?.balance.available || 1_850_000

  // Insights/sugerencias
  const topExpenseCategory = categoryChart[0]
  const avgMonthlyExpense = safeStats.averageMonthlyExpenses
  const avgMonthlyIncome = safeStats.averageMonthlyIncome
  const savingsRate = ((avgMonthlyIncome - avgMonthlyExpense) / avgMonthlyIncome * 100)

  const insights = [
    {
      type: 'spending',
      title: `${topExpenseCategory.label} es tu mayor gasto`,
      description: `Gastás en promedio $${Math.round(topExpenseCategory.value / 24).toLocaleString('es-AR')} por mes en esta categoría.`,
      action: 'Ver detalle',
    },
    {
      type: savingsRate > 0 ? 'positive' : 'warning',
      title: savingsRate > 0 ? `Ahorrás ${savingsRate.toFixed(0)}% de tus ingresos` : 'Tus gastos superan tus ingresos',
      description: savingsRate > 0
        ? `Eso equivale a $${Math.round(avgMonthlyIncome - avgMonthlyExpense).toLocaleString('es-AR')} por mes en promedio.`
        : 'Revisá tus gastos para equilibrar tu presupuesto.',
      action: savingsRate > 0 ? 'Crear meta de ahorro' : 'Analizar gastos',
    },
  ]

  return NextResponse.json({
    profile: {
      name: safeProfile.name,
      family: (safeProfile as any).familyMembers?.map((m: any) => m.name) || [],
    },
    currentBalance,
    stats: {
      totalTransactions: safeStats.totalTransactions,
      totalIncome: safeStats.totalIncome,
      totalExpenses: safeStats.totalExpenses,
      avgMonthlyIncome: safeStats.averageMonthlyIncome,
      avgMonthlyExpenses: safeStats.averageMonthlyExpenses,
      savingsRate: Math.round(savingsRate),
    },
    charts: {
      monthly: monthlyChart,
      categories: categoryChart,
      balance: balanceChart,
    },
    recent,
    insights,
    accounts: accounts.map((a: any) => ({
      name: a.name || a.type || 'Cuenta',
      currency: a.currency,
      balance: a.balance?.available || 0,
    })),
  })
}

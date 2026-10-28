import { NextRequest, NextResponse } from 'next/server'

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
      cachedDataset = { transactions: data.transactions || [] }
      cacheTime = Date.now()
      return cachedDataset
    }
  } catch (error) {
    console.error('[Expense History API] Error fetching from backend:', error)
  }

  return cachedDataset
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const name = searchParams.get('name')
  const category = searchParams.get('category')

  if (!name && !category) {
    return NextResponse.json(
      { error: 'Se requiere "name" o "category" como parámetro' },
      { status: 400 }
    )
  }

  const dataset = await loadDataset()
  if (!dataset || dataset.transactions.length === 0) {
    return NextResponse.json(
      { error: 'Backend no disponible' },
      { status: 404 }
    )
  }

  // Buscar transacciones que coincidan con el nombre o categoría
  const matchingTransactions = dataset.transactions.filter(tx => {
    if (name) {
      const searchName = name.toLowerCase()
      return (
        tx.merchant?.toLowerCase().includes(searchName) ||
        tx.description.toLowerCase().includes(searchName)
      )
    }
    if (category) {
      return tx.category === category
    }
    return false
  })

  if (matchingTransactions.length === 0) {
    return NextResponse.json({
      found: false,
      name: name || category,
      payments: [],
      stats: null,
    })
  }

  // Ordenar por fecha
  const sortedPayments = matchingTransactions
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())

  // Calcular estadísticas
  const totalAmount = sortedPayments.reduce((sum, tx) => sum + tx.amountArs, 0)
  const amounts = sortedPayments.map(tx => tx.amountArs)
  const avgAmount = totalAmount / sortedPayments.length
  const minAmount = Math.min(...amounts)
  const maxAmount = Math.max(...amounts)

  // Primera y última fecha
  const firstPayment = new Date(sortedPayments[0].createdAt)
  const lastPayment = new Date(sortedPayments[sortedPayments.length - 1].createdAt)

  // Calcular meses de suscripción
  const monthsDiff = (lastPayment.getFullYear() - firstPayment.getFullYear()) * 12 +
    (lastPayment.getMonth() - firstPayment.getMonth()) + 1

  // Agrupar por mes para el gráfico
  const byMonth: Record<string, { amount: number; count: number }> = {}
  for (const tx of sortedPayments) {
    const month = tx.createdAt.substring(0, 7)
    if (!byMonth[month]) {
      byMonth[month] = { amount: 0, count: 0 }
    }
    byMonth[month].amount += tx.amountArs
    byMonth[month].count++
  }

  const monthlyHistory = Object.entries(byMonth)
    .map(([month, data]) => ({
      month,
      label: new Date(month + '-01').toLocaleDateString('es-AR', { month: 'short', year: '2-digit' }),
      amount: data.amount,
      count: data.count,
    }))
    .sort((a, b) => a.month.localeCompare(b.month))

  // Calcular variación de precio
  const firstAmount = sortedPayments[0].amountArs
  const lastAmount = sortedPayments[sortedPayments.length - 1].amountArs
  const priceVariation = ((lastAmount - firstAmount) / firstAmount) * 100

  return NextResponse.json({
    found: true,
    name: sortedPayments[0].merchant || sortedPayments[0].description,
    category: sortedPayments[0].category,
    payments: sortedPayments.slice(-24).map(tx => ({ // Últimos 24 pagos
      id: tx.id,
      date: tx.createdAt,
      amount: tx.amountArs,
      description: tx.description,
      method: tx.method,
    })),
    stats: {
      totalPayments: sortedPayments.length,
      totalAmount,
      avgAmount: Math.round(avgAmount),
      minAmount,
      maxAmount,
      firstPaymentDate: firstPayment.toISOString(),
      lastPaymentDate: lastPayment.toISOString(),
      monthsSubscribed: monthsDiff,
      priceVariation: Math.round(priceVariation * 10) / 10,
    },
    monthlyHistory,
  })
}

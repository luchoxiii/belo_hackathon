import { NextRequest, NextResponse } from 'next/server'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { MockDataset, Transaction } from '@/lib/mock-data/types'

let cachedDataset: MockDataset | null = null

function loadDataset(): MockDataset | null {
  if (cachedDataset) return cachedDataset

  const dataPath = join(process.cwd(), 'data', 'mock-transactions.json')
  if (!existsSync(dataPath)) return null

  try {
    cachedDataset = JSON.parse(readFileSync(dataPath, 'utf-8')) as MockDataset
    return cachedDataset
  } catch {
    return null
  }
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

  const dataset = loadDataset()
  if (!dataset) {
    return NextResponse.json(
      { error: 'Dataset not found' },
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

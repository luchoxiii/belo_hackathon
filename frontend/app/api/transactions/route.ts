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
    console.error('[Transactions API] Error fetching from backend:', error)
  }

  return cachedDataset
}

export async function GET(request: NextRequest) {
  const dataset = await loadDataset()

  if (!dataset || dataset.transactions.length === 0) {
    return NextResponse.json(
      { error: 'Backend no disponible. Verificá que esté corriendo en localhost:8000' },
      { status: 404 }
    )
  }

  const { searchParams } = new URL(request.url)

  // Parámetros de filtrado
  const limit = parseInt(searchParams.get('limit') || '50', 10)
  const offset = parseInt(searchParams.get('offset') || '0', 10)
  const type = searchParams.get('type') as 'credit' | 'debit' | null
  const category = searchParams.get('category')
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const search = searchParams.get('search')

  let transactions = [...dataset.transactions]

  // Aplicar filtros
  if (type) {
    transactions = transactions.filter(tx => tx.type === type)
  }

  if (category) {
    const categories = category.split(',')
    transactions = transactions.filter(tx => categories.includes(tx.category))
  }

  if (from) {
    const fromDate = new Date(from)
    transactions = transactions.filter(tx => new Date(tx.createdAt) >= fromDate)
  }

  if (to) {
    const toDate = new Date(to)
    transactions = transactions.filter(tx => new Date(tx.createdAt) <= toDate)
  }

  if (search) {
    const searchLower = search.toLowerCase()
    transactions = transactions.filter(tx =>
      tx.description.toLowerCase().includes(searchLower) ||
      tx.merchant?.toLowerCase().includes(searchLower) ||
      tx.category.toLowerCase().includes(searchLower)
    )
  }

  // Ordenar por fecha descendente (más recientes primero)
  transactions.sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )

  // Paginar
  const total = transactions.length
  const paginatedTransactions = transactions.slice(offset, offset + limit)

  return NextResponse.json({
    transactions: paginatedTransactions,
    pagination: {
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    },
    profile: {
      name: dataset.profile.name,
      family: dataset.profile.familyMembers.map(m => m.name),
    },
    stats: dataset.stats,
  })
}

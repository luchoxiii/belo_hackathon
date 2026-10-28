import { NextRequest, NextResponse } from 'next/server'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { MockDataset, Transaction } from '@/lib/mock-data/types'

// Cache del dataset en memoria
let cachedDataset: MockDataset | null = null

function loadDataset(): MockDataset | null {
  if (cachedDataset) return cachedDataset

  const dataPath = join(process.cwd(), 'data', 'mock-transactions.json')

  if (!existsSync(dataPath)) {
    console.warn('Mock data not found. Run: npm run generate-mock-data')
    return null
  }

  try {
    const data = readFileSync(dataPath, 'utf-8')
    cachedDataset = JSON.parse(data) as MockDataset
    return cachedDataset
  } catch (error) {
    console.error('Error loading mock dataset:', error)
    return null
  }
}

export async function GET(request: NextRequest) {
  const dataset = loadDataset()

  if (!dataset) {
    return NextResponse.json(
      { error: 'Dataset not found. Run: npm run generate-mock-data' },
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

'use client'

import useSWR from 'swr'
import type { Transaction } from '@/lib/mock-data/types'

export type TransactionFilters = {
  limit?: number
  offset?: number
  type?: 'credit' | 'debit'
  category?: string
  from?: string
  to?: string
  search?: string
}

export type TransactionsResponse = {
  transactions: Transaction[]
  pagination: {
    total: number
    limit: number
    offset: number
    hasMore: boolean
  }
  profile: {
    name: string
    family: string[]
  }
  stats: {
    totalTransactions: number
    totalIncome: number
    totalExpenses: number
    averageMonthlyIncome: number
    averageMonthlyExpenses: number
  }
}

const fetcher = async (url: string): Promise<TransactionsResponse> => {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error('Error fetching transactions')
  }
  return response.json()
}

function buildUrl(filters: TransactionFilters): string {
  const params = new URLSearchParams()

  if (filters.limit) params.set('limit', String(filters.limit))
  if (filters.offset) params.set('offset', String(filters.offset))
  if (filters.type) params.set('type', filters.type)
  if (filters.category) params.set('category', filters.category)
  if (filters.from) params.set('from', filters.from)
  if (filters.to) params.set('to', filters.to)
  if (filters.search) params.set('search', filters.search)

  const query = params.toString()
  return `/api/transactions${query ? `?${query}` : ''}`
}

export function useTransactions(filters: TransactionFilters = {}) {
  const url = buildUrl(filters)

  const { data, error, isLoading, mutate } = useSWR<TransactionsResponse>(url, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 30000,
  })

  return {
    transactions: data?.transactions ?? [],
    pagination: data?.pagination,
    profile: data?.profile,
    stats: data?.stats,
    error,
    isLoading,
    refresh: mutate,
  }
}

export function useRecentTransactions(limit: number = 10) {
  return useTransactions({ limit })
}

export function useTransactionsByType(type: 'credit' | 'debit', limit: number = 20) {
  return useTransactions({ type, limit })
}

export function useTransactionSearch(search: string, limit: number = 20) {
  return useTransactions({ search, limit })
}

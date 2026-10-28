'use client'

import useSWR from 'swr'
import type { BeloBalance } from '@/lib/belo'

const fetcher = async (url: string): Promise<BeloBalance> => {
  const res = await fetch(url)
  if (!res.ok) throw new Error('No se pudo obtener el saldo')
  return res.json()
}

export function useBalance() {
  const { data, error, isLoading, mutate } = useSWR('/api/balance', fetcher, {
    refreshInterval: 60_000,
  })
  return { balance: data, error, isLoading, refresh: mutate }
}

const BELO_API_URL = process.env.BELO_API_URL || 'https://b2b.belo.app'
const BELO_API_KEY = process.env.BELO_API_KEY

export type BeloBalance = {
  amount: number
  currency: string
  currencyCode: string
  name: string
  type: string
  decimals: number
  updatedAt: string
  source: 'belo-api' | 'belo-mock'
  yield?: {
    rate: string
    extraYield?: string
    totalYield?: string
  }
  earned?: {
    total: string
    today: string
    month: string
  }
}

export type BeloBalancesResponse = {
  balances: BeloBalance[]
  totalARS: number
}

export type BeloTransaction = {
  id: string
  type: string
  status: string
  createdAt: string
  amount?: string
  currency?: string
  metadata?: Record<string, unknown>
  receipt?: Record<string, unknown>
}

async function beloFetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
  if (!BELO_API_KEY) {
    throw new Error('BELO_API_KEY no está configurada en .env.local')
  }

  const response = await fetch(`${BELO_API_URL}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `ApiKey ${BELO_API_KEY}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Belo API error: ${response.status} - ${error}`)
  }

  return response.json()
}

/**
 * Obtiene los saldos de la cuenta de belo
 */
export async function getBeloBalances(): Promise<BeloBalancesResponse> {
  try {
    const data = await beloFetch<{ data: Array<{
      currencyCode: string
      name: string
      type: string
      decimals: number
      available: string
      yield?: { rate: string; extraYield?: string; totalYield?: string }
      earned?: { total: string; today: string; month: string }
    }> }>('/api/v1/account/balances')

    const balances: BeloBalance[] = data.data.map((b) => ({
      amount: parseFloat(b.available),
      currency: b.currencyCode,
      currencyCode: b.currencyCode,
      name: b.name,
      type: b.type,
      decimals: b.decimals,
      updatedAt: new Date().toISOString(),
      source: 'belo-api' as const,
      yield: b.yield,
      earned: b.earned,
    }))

    // Calcular total en ARS (ARGt es el token de pesos argentinos)
    const arsBalance = balances.find(b => b.currencyCode === 'ARGt')
    const totalARS = arsBalance?.amount || 0

    return { balances, totalARS }
  } catch (error) {
    console.error('Error fetching belo balances:', error)
    // Fallback a mock si falla
    return {
      balances: [{
        amount: 0,
        currency: 'ARGt',
        currencyCode: 'ARGt',
        name: 'Argentine Peso Token',
        type: 'fiat_token',
        decimals: 2,
        updatedAt: new Date().toISOString(),
        source: 'belo-mock',
      }],
      totalARS: 0,
    }
  }
}

/**
 * Obtiene el saldo principal en ARS (para compatibilidad con el código existente)
 */
export async function getBeloBalance(): Promise<{ amount: number; currency: 'ARS'; updatedAt: string; source: 'belo-api' | 'belo-mock' }> {
  const { balances } = await getBeloBalances()

  // Buscar el saldo en ARGt (pesos argentinos)
  const arsBalance = balances.find(b => b.currencyCode === 'ARGt')

  return {
    amount: arsBalance?.amount || 0,
    currency: 'ARS',
    updatedAt: arsBalance?.updatedAt || new Date().toISOString(),
    source: arsBalance?.source || 'belo-mock',
  }
}

/**
 * Obtiene las transacciones de la cuenta
 */
export async function getBeloTransactions(options?: {
  limit?: number
  page?: number
  type?: string
  from?: string
  to?: string
}): Promise<{ transactions: BeloTransaction[]; pagination: { total: number; page: number; limit: number } }> {
  try {
    const params = new URLSearchParams()
    if (options?.limit) params.set('limit', String(options.limit))
    if (options?.page) params.set('page', String(options.page))
    if (options?.type) params.set('type', options.type)
    if (options?.from) params.set('from', options.from)
    if (options?.to) params.set('to', options.to)

    const queryString = params.toString()
    const endpoint = `/api/v1/transactions${queryString ? `?${queryString}` : ''}`

    const data = await beloFetch<{
      data: BeloTransaction[]
      pagination: { total: number; page: number; limit: number }
    }>(endpoint)

    return {
      transactions: data.data,
      pagination: data.pagination,
    }
  } catch (error) {
    console.error('Error fetching belo transactions:', error)
    return {
      transactions: [],
      pagination: { total: 0, page: 1, limit: 20 },
    }
  }
}

/**
 * Obtiene una transacción por ID
 */
export async function getBeloTransaction(id: string): Promise<BeloTransaction | null> {
  try {
    const data = await beloFetch<{ data: BeloTransaction }>(`/api/v1/transactions/${id}`)
    return data.data
  } catch (error) {
    console.error('Error fetching belo transaction:', error)
    return null
  }
}

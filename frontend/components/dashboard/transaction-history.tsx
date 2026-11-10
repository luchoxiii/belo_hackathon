'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  ArrowDownLeft,
  ArrowUpRight,
  Bitcoin,
  CreditCard,
  Building2,
  Zap,
  GraduationCap,
  ShoppingCart,
  Car,
  Heart,
  Landmark,
  ChevronDown,
  ChevronUp,
  Search,
} from 'lucide-react'
import { useTransactions, type TransactionFilters } from '@/hooks/use-transactions'
import { formatARS } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { Transaction, TransactionCategory } from '@/lib/mock-data/types'

// Mapeo de categorías a iconos
const CATEGORY_ICONS: Partial<Record<TransactionCategory, typeof Bitcoin>> = {
  salario: Building2,
  aguinaldo: Building2,
  alquiler: Building2,
  expensas: Building2,
  luz: Zap,
  gas: Zap,
  agua: Zap,
  internet: Zap,
  telefono: Zap,
  compra_crypto: Bitcoin,
  venta_crypto: Bitcoin,
  plazo_fijo_constitucion: Landmark,
  plazo_fijo_vencimiento: Landmark,
  interes_plazo_fijo: Landmark,
  tarjeta_supermercado: ShoppingCart,
  tarjeta_farmacia: Heart,
  tarjeta_restaurante: ShoppingCart,
  tarjeta_combustible: Car,
  tarjeta_indumentaria: ShoppingCart,
  tarjeta_tecnologia: ShoppingCart,
  cuota_colegio: GraduationCap,
  matricula_escolar: GraduationCap,
  actividad_extracurricular: GraduationCap,
  debito_prepaga: Heart,
  seguro_auto: Car,
  mantenimiento_auto: Car,
  peaje: Car,
  combustible: Car,
}

function getCategoryIcon(category: TransactionCategory) {
  return CATEGORY_ICONS[category] || CreditCard
}

function formatTransactionDate(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Hoy'
  if (diffDays === 1) return 'Ayer'
  if (diffDays < 7) return format(date, "EEEE", { locale: es })

  return format(date, "d MMM yyyy", { locale: es })
}

function TransactionItem({ transaction }: { transaction: Transaction }) {
  const Icon = getCategoryIcon(transaction.category)
  const isCredit = transaction.type === 'credit'

  return (
    <div className="flex items-center gap-3 py-3">
      <div
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-full',
          isCredit ? 'bg-income/10 text-income' : 'bg-muted text-muted-foreground'
        )}
      >
        <Icon className="size-5" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="truncate text-sm font-medium">{transaction.description}</p>
        <p className="truncate text-xs text-muted-foreground">
          {transaction.merchant && `${transaction.merchant} · `}
          {formatTransactionDate(transaction.createdAt)}
        </p>
      </div>

      <div className="flex flex-col items-end gap-0.5">
        <p
          className={cn(
            'tabular text-sm font-semibold',
            isCredit ? 'text-income' : 'text-foreground'
          )}
        >
          {isCredit ? '+' : '-'}{formatARS(transaction.amountArs)}
        </p>
        {transaction.crypto && (
          <p className="text-xs text-muted-foreground">
            {transaction.crypto.amount.toFixed(transaction.crypto.asset === 'BTC' ? 6 : 2)} {transaction.crypto.asset}
          </p>
        )}
        {transaction.card?.installments && transaction.card.installments > 1 && (
          <p className="text-xs text-muted-foreground">
            Cuota {transaction.card.currentInstallment}/{transaction.card.installments}
          </p>
        )}
      </div>
    </div>
  )
}

type FilterTab = 'all' | 'income' | 'expenses'

export function TransactionHistory() {
  const [activeTab, setActiveTab] = useState<FilterTab>('all')
  const [expanded, setExpanded] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const filters: TransactionFilters = {
    limit: expanded ? 50 : 10,
    type: activeTab === 'income' ? 'credit' : activeTab === 'expenses' ? 'debit' : undefined,
    search: searchQuery || undefined,
  }

  const { transactions, pagination, stats, isLoading, error } = useTransactions(filters)

  if (error) {
    return (
      <section className="rounded-2xl border p-5">
        <p className="text-sm text-muted-foreground">
          Error cargando historial. Ejecuta: <code className="rounded bg-muted px-1">npm run generate-mock-data</code>
        </p>
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">Historial de movimientos</h2>
          {stats && (
            <p className="text-xs text-muted-foreground">
              {stats.totalTransactions.toLocaleString('es-AR')} transacciones en 2 a{'\u00f1'}os
            </p>
          )}
        </div>

        <div className="flex gap-1 rounded-lg bg-muted p-1">
          <button
            onClick={() => setActiveTab('all')}
            className={cn(
              'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              activeTab === 'all'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Todos
          </button>
          <button
            onClick={() => setActiveTab('income')}
            className={cn(
              'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              activeTab === 'income'
                ? 'bg-background text-income shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <ArrowDownLeft className="mr-1 inline size-3" />
            Ingresos
          </button>
          <button
            onClick={() => setActiveTab('expenses')}
            className={cn(
              'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              activeTab === 'expenses'
                ? 'bg-background text-expense shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <ArrowUpRight className="mr-1 inline size-3" />
            Gastos
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Buscar transacciones..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-lg border bg-background py-2 pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      {/* Stats summary */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/50 p-3">
          <div>
            <p className="text-xs text-muted-foreground">Promedio mensual ingresos</p>
            <p className="tabular text-sm font-semibold text-income">
              +{formatARS(stats.averageMonthlyIncome)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Promedio mensual gastos</p>
            <p className="tabular text-sm font-semibold text-expense">
              -{formatARS(stats.averageMonthlyExpenses)}
            </p>
          </div>
        </div>
      )}

      {/* Transaction list */}
      <div className="divide-y">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 py-3">
              <div className="size-10 animate-pulse rounded-full bg-muted" />
              <div className="flex flex-1 flex-col gap-1">
                <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                <div className="h-3 w-24 animate-pulse rounded bg-muted" />
              </div>
              <div className="h-4 w-20 animate-pulse rounded bg-muted" />
            </div>
          ))
        ) : transactions.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No se encontraron transacciones
          </p>
        ) : (
          transactions.map((tx) => (
            <TransactionItem key={tx.id} transaction={tx} />
          ))
        )}
      </div>

      {/* Show more / Show less */}
      {pagination && pagination.total > 10 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded(!expanded)}
          className="mx-auto"
        >
          {expanded ? (
            <>
              <ChevronUp className="mr-1 size-4" />
              Ver menos
            </>
          ) : (
            <>
              <ChevronDown className="mr-1 size-4" />
              Ver {Math.min(pagination.total - 10, 40)} más
            </>
          )}
        </Button>
      )}
    </section>
  )
}

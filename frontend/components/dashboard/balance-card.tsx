import { formatARS } from '@/lib/format'
import { cn } from '@/lib/utils'

type Props = {
  amount?: number
  loading: boolean
  updatedAt?: string
  minBalance?: { label: string; balance: number }
  endBalance?: number
}

export function BalanceCard({ amount, loading, updatedAt, minBalance, endBalance }: Props) {
  return (
    <section
      aria-label="Saldo actual"
      className="flex flex-col gap-5 rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/25 via-card to-card p-5 md:p-6"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Saldo actual</h2>
        <span className="rounded-full bg-teal-500/20 px-2.5 py-1 text-xs font-medium text-teal-400">
          datos de prueba
        </span>
      </div>

      {loading || amount === undefined ? (
        <div className="h-11 w-56 animate-pulse rounded-lg bg-muted" aria-label="Cargando saldo" />
      ) : (
        <p className="tabular font-heading text-4xl font-semibold tracking-tight md:text-5xl">
          {formatARS(amount)}
        </p>
      )}

      <dl className="grid grid-cols-2 gap-4 border-t border-border pt-4 text-sm">
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">Punto más bajo</dt>
          <dd
            className={cn(
              'tabular font-heading font-semibold',
              minBalance && minBalance.balance < 0 && 'text-expense',
            )}
          >
            {minBalance ? formatARS(minBalance.balance) : '—'}
          </dd>
          {minBalance && <dd className="text-xs text-muted-foreground">{minBalance.label}</dd>}
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">Saldo en 12 meses</dt>
          <dd
            className={cn(
              'tabular font-heading font-semibold',
              endBalance !== undefined && endBalance < 0 && 'text-expense',
            )}
          >
            {endBalance !== undefined ? formatARS(endBalance) : '—'}
          </dd>
          {updatedAt && <dd className="text-xs text-muted-foreground">con inflación incluida</dd>}
        </div>
      </dl>
    </section>
  )
}

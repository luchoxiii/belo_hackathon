import { formatARS } from '@/lib/format'
import type { Occurrence } from '@/lib/projection'
import { cn } from '@/lib/utils'

const day = new Intl.DateTimeFormat('es-AR', { day: 'numeric' })
const month = new Intl.DateTimeFormat('es-AR', { month: 'short' })

export function UpcomingEvents({
  occurrences,
  hasEvents,
  hydrated,
}: {
  occurrences: Occurrence[]
  hasEvents: boolean
  hydrated: boolean
}) {
  return (
    <section aria-label="Próximos eventos" className="rounded-2xl border border-border bg-card p-4 md:p-5">
      <div className="mb-3 flex flex-col gap-0.5">
        <h2 className="text-base font-semibold">Próximos eventos</h2>
        <p className="text-xs text-muted-foreground">Lo que viene en los próximos 4 meses, ya ajustado por inflación.</p>
      </div>

      {!hydrated ? (
        <div className="h-32 animate-pulse rounded-xl bg-muted" />
      ) : occurrences.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {hasEvents ? 'No hay eventos en los próximos meses.' : 'Cuando cargues eventos, los vas a ver acá.'}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {occurrences.map((o) => (
            <li key={`${o.eventId}-${o.date.toISOString()}`} className="flex items-center gap-3 py-3">
              <div className="flex size-11 shrink-0 flex-col items-center justify-center rounded-xl bg-secondary">
                <span className="tabular font-heading text-sm font-semibold leading-none">{day.format(o.date)}</span>
                <span className="mt-0.5 text-[11px] uppercase leading-none text-muted-foreground">
                  {month.format(o.date).replace('.', '')}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{o.name}</p>
                <p className="text-xs text-muted-foreground">{o.category}</p>
              </div>
              <p className={cn('tabular text-sm font-semibold', o.amount >= 0 ? 'text-income' : 'text-expense')}>
                {o.amount >= 0 ? '+' : '−'}
                {formatARS(Math.abs(o.amount))}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

import { CircleCheck, CircleX, Loader2, Sparkles } from 'lucide-react'
import { formatARS } from '@/lib/format'
import type { AffordabilityResult } from '@/lib/projection'
import { cn } from '@/lib/utils'

type ToolPartLike = {
  type: string
  state?: string
  output?: unknown
}

const RUNNING_LABELS: Record<string, string> = {
  obtenerSituacionActual: 'Revisando tu saldo y tus eventos…',
  proyectarSaldo: 'Proyectando tu saldo mes a mes…',
  evaluarGasto: 'Simulando el gasto contra tu proyección…',
}

const DONE_LABELS: Record<string, string> = {
  obtenerSituacionActual: 'Revisé tu saldo y tus eventos',
  proyectarSaldo: 'Proyecté tu saldo mes a mes',
}

type Verdict = AffordabilityResult & { description?: string }

export function ToolPart({ part }: { part: ToolPartLike }) {
  const name = part.type.replace(/^tool-/, '')

  if (part.state === 'output-error') {
    return <p className="text-xs text-destructive">No pude completar el cálculo ({name}).</p>
  }

  if (part.state !== 'output-available') {
    return (
      <div className="flex w-fit items-center gap-2 rounded-full bg-secondary px-3 py-1.5 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin text-primary" aria-hidden="true" />
        {RUNNING_LABELS[name] ?? 'Calculando…'}
      </div>
    )
  }

  if (name === 'evaluarGasto' && part.output && !('error' in (part.output as object))) {
    return <VerdictCard result={part.output as Verdict} />
  }

  return (
    <div className="flex w-fit items-center gap-2 rounded-full bg-secondary px-3 py-1.5 text-xs text-muted-foreground">
      <Sparkles className="size-3.5 text-primary" aria-hidden="true" />
      {DONE_LABELS[name] ?? 'Cálculo completado'}
    </div>
  )
}

function VerdictCard({ result }: { result: Verdict }) {
  const ok = result.canAfford
  const Icon = ok ? CircleCheck : CircleX

  return (
    <section
      aria-label="Resultado de la simulación"
      className="overflow-hidden rounded-2xl border border-border bg-card"
    >
      <div
        className={cn(
          'flex items-center gap-3 px-4 py-3',
          ok ? 'bg-income/10 text-income' : 'bg-expense/10 text-expense',
        )}
      >
        <Icon className="size-5 shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <p className="font-heading text-sm font-semibold">
            {ok ? 'Te alcanza' : 'No te alcanza'}
          </p>
          <p className="truncate text-xs opacity-80">
            {result.description ?? 'Gasto'} · {result.targetMonthLabel}
          </p>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-px bg-border text-sm">
        <Stat label="Costo ese mes" value={formatARS(result.requestedInTargetPesos)} hint={`${formatARS(result.requestedTodayPesos)} hoy`} />
        <Stat label="Saldo ese mes" value={formatARS(result.balanceAtTargetWith)} negative={result.balanceAtTargetWith < 0} />
        <Stat
          label="Saldo más bajo"
          value={formatARS(result.lowestBalanceAfter)}
          hint={result.lowestBalanceMonthLabel}
          negative={result.lowestBalanceAfter < 0}
        />
        <Stat label="Máximo posible" value={formatARS(result.maxAffordableInTargetPesos)} hint={`${formatARS(result.maxAffordableTodayPesos)} de hoy`} />
      </dl>
    </section>
  )
}

function Stat({
  label,
  value,
  hint,
  negative,
}: {
  label: string
  value: string
  hint?: string
  negative?: boolean
}) {
  return (
    <div className="flex flex-col gap-0.5 bg-card px-4 py-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn('tabular font-heading text-base font-semibold', negative && 'text-expense')}>
        {value}
      </dd>
      {hint && <dd className="text-xs text-muted-foreground">{hint}</dd>}
    </div>
  )
}

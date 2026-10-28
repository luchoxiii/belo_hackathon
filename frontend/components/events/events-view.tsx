'use client'

import { useMemo, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, CalendarPlus, Pencil, Sparkles, Trash2, TrendingUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useFinance } from '@/lib/finance-store'
import { formatARS } from '@/lib/format'
import { FREQUENCY_LABELS, type FinancialEvent } from '@/lib/types'
import { cn } from '@/lib/utils'
import { EventForm } from './event-form'

const dateFmt = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })

function fmtIso(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return dateFmt.format(new Date(y, m - 1, d))
}

type FormState = { mode: 'closed' } | { mode: 'new' } | { mode: 'edit'; event: FinancialEvent }

export function EventsView() {
  const { events, hydrated, addEvent, updateEvent, removeEvent, loadDemo } = useFinance()
  const [form, setForm] = useState<FormState>({ mode: 'closed' })
  const [toDelete, setToDelete] = useState<FinancialEvent | null>(null)

  const sorted = useMemo(() => [...events].sort((a, b) => a.startDate.localeCompare(b.startDate)), [events])

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 md:p-8">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">Eventos</h1>
          <p className="text-sm text-muted-foreground">Tus ingresos y gastos para proyectar tu flujo de dinero.</p>
        </div>
        <Button onClick={() => setForm({ mode: 'new' })}>
          <CalendarPlus aria-hidden="true" />
          Agregar
        </Button>
      </header>

      {!hydrated ? (
        <div className="h-40 animate-pulse rounded-2xl bg-muted" />
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border px-6 py-12 text-center">
          <p className="max-w-xs text-pretty text-sm leading-relaxed text-muted-foreground">
            Todavía no hay eventos. Agregá tu sueldo y tus gastos fijos para que las proyecciones tengan sentido.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => setForm({ mode: 'new' })}>Agregar el primero</Button>
            <Button variant="secondary" onClick={loadDemo}>
              <Sparkles aria-hidden="true" />
              Cargar ejemplo
            </Button>
          </div>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {sorted.map((event) => (
            <EventRow
              key={event.id}
              event={event}
              onEdit={() => setForm({ mode: 'edit', event })}
              onDelete={() => setToDelete(event)}
            />
          ))}
        </ul>
      )}

      <Dialog open={form.mode !== 'closed'} onOpenChange={(open) => !open && setForm({ mode: 'closed' })}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
          {form.mode !== 'closed' && (
            <EventForm
              initial={form.mode === 'edit' ? form.event : undefined}
              onCancel={() => setForm({ mode: 'closed' })}
              onSubmit={(draft) => {
                if (form.mode === 'edit') updateEvent({ ...draft, id: form.event.id })
                else addEvent(draft)
                setForm({ mode: 'closed' })
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={toDelete !== null} onOpenChange={(open) => !open && setToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-heading">Eliminar evento</DialogTitle>
            <DialogDescription>
              Vas a eliminar «{toDelete?.name}». Esto cambia tus proyecciones y no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setToDelete(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (toDelete) removeEvent(toDelete.id)
                setToDelete(null)
              }}
            >
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function EventRow({
  event,
  onEdit,
  onDelete,
}: {
  event: FinancialEvent
  onEdit: () => void
  onDelete: () => void
}) {
  const income = event.type === 'ingreso'
  const Icon = income ? ArrowDownLeft : ArrowUpRight

  return (
    <li className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 md:p-4">
      <span
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-xl',
          income ? 'bg-income/15 text-income' : 'bg-expense/15 text-expense',
        )}
      >
        <Icon className="size-5" aria-hidden="true" />
        <span className="sr-only">{income ? 'Ingreso' : 'Gasto'}</span>
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="line-clamp-2 text-sm font-medium">{event.name}</p>
        <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
          <span>{event.category}</span>
          <span aria-hidden="true">·</span>
          <span>{FREQUENCY_LABELS[event.frequency]}</span>
          <span aria-hidden="true">·</span>
          <span>
            {event.frequency === 'unico' ? fmtIso(event.startDate) : `desde ${fmtIso(event.startDate)}`}
            {event.endDate && ` hasta ${fmtIso(event.endDate)}`}
          </span>
          {event.adjustsForInflation && (
            <span className="inline-flex items-center gap-1 text-primary">
              <TrendingUp className="size-3" aria-hidden="true" />
              inflación
            </span>
          )}
        </p>
      </div>

      <p className={cn('tabular shrink-0 text-sm font-semibold', income ? 'text-income' : 'text-expense')}>
        {income ? '+' : '−'}
        {formatARS(event.amount)}
      </p>

      <div className="flex shrink-0">
        <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label={`Editar ${event.name}`}>
          <Pencil aria-hidden="true" />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onDelete} aria-label={`Eliminar ${event.name}`}>
          <Trash2 aria-hidden="true" />
        </Button>
      </div>
    </li>
  )
}

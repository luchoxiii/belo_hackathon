'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { formatARS } from '@/lib/format'
import {
  CATEGORIES,
  FREQUENCIES,
  FREQUENCY_LABELS,
  type Category,
  type FinancialEvent,
  type Frequency,
} from '@/lib/types'
import { cn } from '@/lib/utils'

type Draft = Omit<FinancialEvent, 'id'>

const QUICK_PICKS: { name: string; type: Draft['type']; category: Category }[] = [
  { name: 'Sueldo', type: 'ingreso', category: 'Sueldo' },
  { name: 'Aguinaldo', type: 'ingreso', category: 'Aguinaldo' },
  { name: 'Alquiler', type: 'gasto', category: 'Alquiler' },
  { name: 'Matrícula', type: 'gasto', category: 'Educación' },
  { name: 'IVA', type: 'gasto', category: 'Impuestos' },
  { name: 'Ganancias', type: 'gasto', category: 'Impuestos' },
]

const CATEGORY_ITEMS = CATEGORIES.map((c) => ({ value: c, label: c }))
const FREQUENCY_ITEMS = FREQUENCIES.map((f) => ({ value: f, label: FREQUENCY_LABELS[f] }))

function parseAmount(raw: string) {
  const normalized = raw.replace(/[^\d,]/g, '').replace(',', '.')
  const value = Number(normalized)
  return Number.isFinite(value) ? value : 0
}

export function EventForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial?: FinancialEvent
  onSubmit: (draft: Draft) => void
  onCancel: () => void
}) {
  const [type, setType] = useState<Draft['type']>(initial?.type ?? 'gasto')
  const [name, setName] = useState(initial?.name ?? '')
  const [category, setCategory] = useState<Category>(initial?.category ?? 'Otros')
  const [amountRaw, setAmountRaw] = useState(initial ? String(initial.amount).replace('.', ',') : '')
  const [frequency, setFrequency] = useState<Frequency>(initial?.frequency ?? 'mensual')
  const [startDate, setStartDate] = useState(initial?.startDate ?? format(new Date(), 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState(initial?.endDate ?? '')
  const [adjusts, setAdjusts] = useState(initial?.adjustsForInflation ?? true)
  const [submitted, setSubmitted] = useState(false)

  const amount = parseAmount(amountRaw)
  const errors = {
    name: name.trim() ? null : 'Poné un nombre',
    amount: amount > 0 ? null : 'Ingresá un monto mayor a cero',
    startDate: startDate ? null : 'Elegí una fecha de inicio',
    endDate: endDate && startDate && endDate < startDate ? 'Tiene que ser posterior al inicio' : null,
  }
  const valid = !Object.values(errors).some(Boolean)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    if (!valid) return
    onSubmit({
      type,
      name: name.trim(),
      category,
      amount,
      frequency,
      startDate,
      endDate: frequency === 'unico' || !endDate ? null : endDate,
      adjustsForInflation: adjusts,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <DialogHeader>
        <DialogTitle className="font-heading text-lg">{initial ? 'Editar evento' : 'Nuevo evento'}</DialogTitle>
        <DialogDescription>Los montos van en pesos de hoy. Se ajustan automáticamente por inflación.</DialogDescription>
      </DialogHeader>

      <div role="radiogroup" aria-label="Tipo" className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
        {(['gasto', 'ingreso'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={type === t}
            onClick={() => setType(t)}
            className={cn(
              'rounded-lg py-2 text-sm font-medium capitalize transition-colors',
              type === t
                ? t === 'ingreso'
                  ? 'bg-income text-background'
                  : 'bg-expense text-background'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="event-name">Nombre</Label>
        <Input
          id="event-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej: Sueldo, Alquiler…"
          maxLength={80}
          aria-invalid={submitted && !!errors.name}
        />
        {submitted && errors.name && <FieldError>{errors.name}</FieldError>}
        <div className="flex flex-wrap gap-1.5" aria-label="Sugerencias">
          {QUICK_PICKS.map((pick) => (
            <button
              key={pick.name}
              type="button"
              onClick={() => {
                setName(pick.name)
                setType(pick.type)
                setCategory(pick.category)
              }}
              className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
            >
              {pick.name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="event-amount">Monto (ARS)</Label>
          <Input
            id="event-amount"
            inputMode="decimal"
            value={amountRaw}
            onChange={(e) => setAmountRaw(e.target.value)}
            placeholder="0"
            aria-invalid={submitted && !!errors.amount}
            className="tabular"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="event-category">Categoría</Label>
          <Select items={CATEGORY_ITEMS} value={category} onValueChange={(v) => v && setCategory(v as Category)}>
            <SelectTrigger id="event-category" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {amount > 0 ? (
        <p className="-mt-2 text-xs text-muted-foreground">{formatARS(amount)}</p>
      ) : (
        submitted && errors.amount && <FieldError>{errors.amount}</FieldError>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="event-frequency">Frecuencia</Label>
        <Select items={FREQUENCY_ITEMS} value={frequency} onValueChange={(v) => v && setFrequency(v as Frequency)}>
          <SelectTrigger id="event-frequency" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FREQUENCIES.map((f) => (
              <SelectItem key={f} value={f}>
                {FREQUENCY_LABELS[f]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="event-start">{frequency === 'unico' ? 'Fecha' : 'Fecha de inicio'}</Label>
          <Input
            id="event-start"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            aria-invalid={submitted && !!errors.startDate}
          />
          {submitted && errors.startDate && <FieldError>{errors.startDate}</FieldError>}
        </div>
        {frequency !== 'unico' && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="event-end">
              Fin <span className="font-normal text-muted-foreground">(opcional)</span>
            </Label>
            <Input
              id="event-end"
              type="date"
              value={endDate}
              min={startDate}
              onChange={(e) => setEndDate(e.target.value)}
              aria-invalid={submitted && !!errors.endDate}
            />
            {submitted && errors.endDate && <FieldError>{errors.endDate}</FieldError>}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-3">
        <div className="flex flex-col gap-0.5">
          <Label htmlFor="event-inflation">Ajusta por inflación</Label>
          <p className="text-xs text-muted-foreground">El monto crece mes a mes con la inflación esperada.</p>
        </div>
        <Switch id="event-inflation" checked={adjusts} onCheckedChange={setAdjusts} />
      </div>

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit">{initial ? 'Guardar cambios' : 'Agregar evento'}</Button>
      </DialogFooter>
    </form>
  )
}

function FieldError({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="text-xs text-destructive">
      {children}
    </p>
  )
}

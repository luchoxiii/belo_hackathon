'use client'

import { useState } from 'react'
import { Check, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useFinance } from '@/lib/finance-store'
import { inflationFactor } from '@/lib/projection'
import { formatARS } from '@/lib/format'

export function SettingsView() {
  const { settings, hydrated, events, updateSettings, clearEvents, resetAll } = useFinance()

  if (!hydrated) return <div className="mx-auto h-64 w-full max-w-xl animate-pulse rounded-2xl bg-muted m-4 md:m-8" />

  return (
    <SettingsForm
      key={settings.monthlyInflation}
      initialInflation={settings.monthlyInflation}
      eventCount={events.length}
      onSave={(monthlyInflation) => updateSettings({ ...settings, monthlyInflation })}
      onClearEvents={clearEvents}
      onResetAll={resetAll}
    />
  )
}

function SettingsForm({
  initialInflation,
  eventCount,
  onSave,
  onClearEvents,
  onResetAll,
}: {
  initialInflation: number
  eventCount: number
  onSave: (value: number) => void
  onClearEvents: () => void
  onResetAll: () => void
}) {
  const [raw, setRaw] = useState(String(initialInflation).replace('.', ','))
  const [saved, setSaved] = useState(false)

  const value = Number(raw.replace(',', '.'))
  const valid = raw.trim() !== '' && Number.isFinite(value) && value >= 0 && value <= 100
  const yearly = valid ? (inflationFactor(value, 12) - 1) * 100 : null

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 p-4 md:p-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Configuración</h1>
        <p className="text-sm text-muted-foreground">Ajustes para las proyecciones de tu saldo.</p>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!valid) return
          onSave(value)
          setSaved(true)
        }}
        className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-5"
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="inflation">Inflación mensual esperada (%)</Label>
          <Input
            id="inflation"
            inputMode="decimal"
            value={raw}
            onChange={(e) => {
              setRaw(e.target.value)
              setSaved(false)
            }}
            aria-invalid={!valid}
            className="tabular max-w-32"
          />
          {valid && yearly !== null ? (
            <p className="text-xs leading-relaxed text-muted-foreground">
              Equivale a una inflación anual cercana al <strong className="tabular">{yearly.toFixed(0)}%</strong>: algo que hoy
              cuesta {formatARS(100_000)} costaría {formatARS(100_000 * inflationFactor(value, 12))} en un año.
            </p>
          ) : (
            <p role="alert" className="text-xs text-destructive">
              Ingresá un número entre 0 y 100.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="currency">Moneda base</Label>
          <Input id="currency" value="ARS — Peso argentino" disabled className="max-w-64" />
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={!valid}>
            Guardar
          </Button>
          {saved && (
            <span role="status" className="flex items-center gap-1.5 text-sm text-income">
              <Check className="size-4" aria-hidden="true" />
              Guardado
            </span>
          )}
        </div>
      </form>

      <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold">Datos</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Todo se guarda solo en este navegador. Tenés {eventCount} {eventCount === 1 ? 'evento cargado' : 'eventos cargados'}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onClearEvents} disabled={eventCount === 0}>
            <Trash2 aria-hidden="true" />
            Borrar eventos
          </Button>
          <Button variant="ghost" onClick={onResetAll}>
            Restablecer todo
          </Button>
        </div>
      </section>
    </div>
  )
}

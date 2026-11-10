'use client'

import { useState, useEffect } from 'react'
import { X, Plus, Trash2 } from 'lucide-react'
import { useRecurringExpenses } from '@/lib/recurring-expenses'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  RECURRING_EXPENSE_CATEGORIES,
  ADJUSTMENT_FREQUENCY_LABELS,
  ADJUSTMENT_TYPE_LABELS,
  type RecurringExpense,
  type AdjustmentType,
  type AdjustmentFrequency,
  type RenewalCost,
} from '@/lib/recurring-expenses/types'

type Props = {
  expense?: RecurringExpense | null
  onClose: () => void
}

export function RecurringExpenseForm({ expense, onClose }: Props) {
  const { addRecurringExpense, updateRecurringExpense } = useRecurringExpenses()

  const [name, setName] = useState(expense?.name || '')
  const [description, setDescription] = useState(expense?.description || '')
  const [category, setCategory] = useState(expense?.category || 'otros')
  const [baseAmount, setBaseAmount] = useState(expense?.baseAmount?.toString() || '')
  const [paymentFrequency, setPaymentFrequency] = useState<RecurringExpense['paymentFrequency']>(
    expense?.paymentFrequency || 'monthly'
  )
  const [paymentDay, setPaymentDay] = useState(expense?.paymentDay?.toString() || '1')
  const [startDate, setStartDate] = useState(
    expense?.startDate || new Date().toISOString().split('T')[0]
  )

  // Adjustment rule
  const [adjustmentType, setAdjustmentType] = useState<AdjustmentType>(
    expense?.adjustmentRule?.type || 'none'
  )
  const [adjustmentValue, setAdjustmentValue] = useState(
    expense?.adjustmentRule?.value?.toString() || ''
  )
  const [adjustmentFrequency, setAdjustmentFrequency] = useState<AdjustmentFrequency>(
    expense?.adjustmentRule?.frequency || 'quarterly'
  )

  // Renewal rule
  const [hasRenewal, setHasRenewal] = useState(!!expense?.renewalRule)
  const [renewalMonths, setRenewalMonths] = useState(
    expense?.renewalRule?.frequencyMonths?.toString() || '24'
  )
  const [nextRenewalDate, setNextRenewalDate] = useState(
    expense?.renewalRule?.nextRenewalDate || ''
  )
  const [renewalCosts, setRenewalCosts] = useState<RenewalCost[]>(
    expense?.renewalRule?.associatedCosts || []
  )

  const [notes, setNotes] = useState(expense?.notes || '')

  const isEditing = !!expense

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const amount = Number(baseAmount.replace(/\./g, '').replace(',', '.'))
    if (!name || isNaN(amount) || amount <= 0) return

    const data = {
      name,
      description: description || undefined,
      category,
      baseAmount: amount,
      currency: 'ARS' as const,
      startDate,
      paymentFrequency,
      paymentDay: Number(paymentDay),
      adjustmentRule: adjustmentType !== 'none'
        ? {
            type: adjustmentType,
            value: adjustmentType === 'fixed_percent' ? Number(adjustmentValue) : undefined,
            frequency: adjustmentFrequency,
          }
        : undefined,
      renewalRule: hasRenewal && nextRenewalDate
        ? {
            frequencyMonths: Number(renewalMonths),
            nextRenewalDate,
            associatedCosts: renewalCosts,
          }
        : undefined,
      adjustsWithServices: category === 'servicios',
      notes: notes || undefined,
    }

    if (isEditing && expense) {
      updateRecurringExpense({
        ...expense,
        ...data,
      })
    } else {
      addRecurringExpense(data)
    }

    onClose()
  }

  function addRenewalCost() {
    setRenewalCosts([
      ...renewalCosts,
      {
        id: crypto.randomUUID(),
        name: '',
        amount: 0,
        isMultiplierOfBase: false,
      },
    ])
  }

  function updateRenewalCost(index: number, updates: Partial<RenewalCost>) {
    setRenewalCosts(
      renewalCosts.map((cost, i) => (i === index ? { ...cost, ...updates } : cost))
    )
  }

  function removeRenewalCost(index: number) {
    setRenewalCosts(renewalCosts.filter((_, i) => i !== index))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border bg-card p-6 shadow-xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1 hover:bg-muted"
        >
          <X className="size-5" />
        </button>

        <h2 className="text-xl font-semibold mb-6">
          {isEditing ? 'Editar gasto fijo' : 'Nuevo gasto fijo'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info */}
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="name">Nombre</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej: Alquiler departamento"
                  required
                />
              </div>

              <div>
                <Label htmlFor="amount">Monto actual</Label>
                <Input
                  id="amount"
                  value={baseAmount}
                  onChange={(e) => setBaseAmount(e.target.value)}
                  placeholder="450000"
                  inputMode="numeric"
                  required
                />
              </div>

              <div>
                <Label htmlFor="category">Categoría</Label>
                <select
                  id="category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {Object.entries(RECURRING_EXPENSE_CATEGORIES).map(([key, { label }]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <Label htmlFor="description">Descripción (opcional)</Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ej: Departamento 3 ambientes en Palermo"
              />
            </div>
          </div>

          {/* Payment Info */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground">Frecuencia de pago</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="frequency">Frecuencia</Label>
                <select
                  id="frequency"
                  value={paymentFrequency}
                  onChange={(e) => setPaymentFrequency(e.target.value as RecurringExpense['paymentFrequency'])}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="monthly">Mensual</option>
                  <option value="bimonthly">Bimestral</option>
                  <option value="quarterly">Trimestral</option>
                  <option value="semester">Semestral</option>
                  <option value="yearly">Anual</option>
                </select>
              </div>

              <div>
                <Label htmlFor="day">Día de pago</Label>
                <Input
                  id="day"
                  type="number"
                  min="1"
                  max="28"
                  value={paymentDay}
                  onChange={(e) => setPaymentDay(e.target.value)}
                />
              </div>

              <div>
                <Label htmlFor="startDate">Desde</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Adjustment Rule */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground">Regla de ajuste</h3>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="adjustType">Tipo de ajuste</Label>
                <select
                  id="adjustType"
                  value={adjustmentType}
                  onChange={(e) => setAdjustmentType(e.target.value as AdjustmentType)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {Object.entries(ADJUSTMENT_TYPE_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              {adjustmentType === 'fixed_percent' && (
                <div>
                  <Label htmlFor="adjustValue">Porcentaje (%)</Label>
                  <Input
                    id="adjustValue"
                    type="number"
                    step="0.1"
                    value={adjustmentValue}
                    onChange={(e) => setAdjustmentValue(e.target.value)}
                    placeholder="5"
                  />
                </div>
              )}

              {adjustmentType !== 'none' && (
                <div className={adjustmentType === 'ipc' ? 'sm:col-span-2' : ''}>
                  <Label htmlFor="adjustFreq">Frecuencia del ajuste</Label>
                  <select
                    id="adjustFreq"
                    value={adjustmentFrequency}
                    onChange={(e) => setAdjustmentFrequency(e.target.value as AdjustmentFrequency)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    {Object.entries(ADJUSTMENT_FREQUENCY_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {adjustmentType === 'ipc' && (
              <p className="text-xs text-muted-foreground">
                El monto se ajustará automáticamente según el IPC oficial de INDEC
              </p>
            )}
          </div>

          {/* Renewal Rule */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="hasRenewal"
                checked={hasRenewal}
                onChange={(e) => setHasRenewal(e.target.checked)}
                className="size-4 rounded border-input"
              />
              <Label htmlFor="hasRenewal" className="text-sm font-medium">
                Tiene renovación periódica (ej: contrato de alquiler)
              </Label>
            </div>

            {hasRenewal && (
              <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="renewalMonths">Renovar cada (meses)</Label>
                    <Input
                      id="renewalMonths"
                      type="number"
                      min="1"
                      value={renewalMonths}
                      onChange={(e) => setRenewalMonths(e.target.value)}
                    />
                  </div>

                  <div>
                    <Label htmlFor="nextRenewal">Próxima renovación</Label>
                    <Input
                      id="nextRenewal"
                      type="date"
                      value={nextRenewalDate}
                      onChange={(e) => setNextRenewalDate(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">Costos asociados a la renovación</Label>
                    <Button type="button" variant="ghost" size="sm" onClick={addRenewalCost}>
                      <Plus className="size-3" />
                      Agregar
                    </Button>
                  </div>

                  {renewalCosts.map((cost, index) => (
                    <div key={cost.id} className="flex items-end gap-2">
                      <div className="flex-1">
                        <Input
                          placeholder="Nombre (ej: Depósito)"
                          value={cost.name}
                          onChange={(e) => updateRenewalCost(index, { name: e.target.value })}
                        />
                      </div>
                      <div className="w-24">
                        <Input
                          type="number"
                          placeholder="Monto"
                          value={cost.amount || ''}
                          onChange={(e) =>
                            updateRenewalCost(index, { amount: Number(e.target.value) })
                          }
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={`multiplier-${index}`}
                          checked={cost.isMultiplierOfBase}
                          onChange={(e) =>
                            updateRenewalCost(index, { isMultiplierOfBase: e.target.checked })
                          }
                          className="size-4"
                        />
                        <Label htmlFor={`multiplier-${index}`} className="text-xs whitespace-nowrap">
                          × base
                        </Label>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeRenewalCost(index)}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  ))}

                  {renewalCosts.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      Agregá costos como depósito (2x base), garantía, comisión, mudanza, etc.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <Label htmlFor="notes">Notas (opcional)</Label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notas adicionales..."
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancelar
            </Button>
            <Button type="submit" className="flex-1">
              {isEditing ? 'Guardar cambios' : 'Agregar gasto'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

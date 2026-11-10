import {
  addMonths,
  differenceInCalendarMonths,
  endOfMonth,
  format,
  isAfter,
  isBefore,
  parseISO,
  startOfDay,
  startOfMonth,
} from 'date-fns'
import { FREQUENCY_STEP_MONTHS, type FinancialEvent, type Settings } from './types'

export type Occurrence = {
  eventId: string
  name: string
  type: FinancialEvent['type']
  category: FinancialEvent['category']
  date: Date
  /** Monto ya ajustado por inflación (si corresponde), con signo según tipo. */
  amount: number
}

export type MonthProjection = {
  /** yyyy-MM */
  month: string
  label: string
  income: number
  expense: number
  net: number
  /** Saldo al cierre del mes. */
  balance: number
}

export type Projection = {
  startBalance: number
  months: MonthProjection[]
  minBalance: { month: string; label: string; balance: number }
  endBalance: number
}

export function inflationFactor(monthlyInflation: number, monthsAhead: number) {
  return Math.pow(1 + monthlyInflation / 100, Math.max(0, monthsAhead))
}

/**
 * Los montos se cargan a valores de hoy. Si el evento ajusta por inflación,
 * cada ocurrencia se multiplica por (1 + inflación mensual)^(meses desde hoy).
 */
export function getOccurrences(
  events: FinancialEvent[],
  settings: Settings,
  from: Date,
  to: Date,
): Occurrence[] {
  const today = startOfDay(from)
  const result: Occurrence[] = []

  for (const event of events) {
    const start = parseISO(event.startDate)
    const end = event.endDate ? parseISO(event.endDate) : null
    const step = FREQUENCY_STEP_MONTHS[event.frequency]
    const maxOccurrences = step === 0 ? 1 : 600

    for (let k = 0; k < maxOccurrences; k++) {
      const date = addMonths(start, k * step)
      if (isAfter(date, to)) break
      if (end && isAfter(date, end)) break
      if (isBefore(date, today)) continue

      const monthsAhead = differenceInCalendarMonths(date, today)
      const factor = event.adjustsForInflation
        ? inflationFactor(settings.monthlyInflation, monthsAhead)
        : 1
      const value = event.amount * factor

      result.push({
        eventId: event.id,
        name: event.name,
        type: event.type,
        category: event.category,
        date,
        amount: event.type === 'ingreso' ? value : -value,
      })
    }
  }

  return result.sort((a, b) => a.date.getTime() - b.date.getTime())
}

export function monthLabel(date: Date) {
  const label = new Intl.DateTimeFormat('es-AR', { month: 'short', year: '2-digit' })
    .format(date)
    .replace('.', '')
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export function projectBalance(input: {
  startBalance: number
  events: FinancialEvent[]
  settings: Settings
  months: number
  today?: Date
  /** Gasto o ingreso puntual extra a simular (ya inflado), con signo. */
  extra?: { date: Date; amount: number }[]
}): Projection {
  const today = startOfDay(input.today ?? new Date())
  const horizon = endOfMonth(addMonths(today, input.months - 1))
  const occurrences = getOccurrences(input.events, input.settings, today, horizon)
  const extra = input.extra ?? []

  let balance = input.startBalance
  const months: MonthProjection[] = []

  for (let i = 0; i < input.months; i++) {
    const monthStart = startOfMonth(addMonths(today, i))
    const monthEnd = endOfMonth(monthStart)
    let income = 0
    let expense = 0

    const inMonth = (d: Date) => !isBefore(d, monthStart) && !isAfter(d, monthEnd)
    for (const o of occurrences) {
      if (!inMonth(o.date)) continue
      if (o.amount >= 0) income += o.amount
      else expense += -o.amount
    }
    for (const e of extra) {
      if (!inMonth(e.date)) continue
      if (e.amount >= 0) income += e.amount
      else expense += -e.amount
    }

    balance += income - expense
    months.push({
      month: format(monthStart, 'yyyy-MM'),
      label: monthLabel(monthStart),
      income: Math.round(income),
      expense: Math.round(expense),
      net: Math.round(income - expense),
      balance: Math.round(balance),
    })
  }

  const lowest = months.reduce((min, m) => (m.balance < min.balance ? m : min), months[0])

  return {
    startBalance: input.startBalance,
    months,
    minBalance: { month: lowest.month, label: lowest.label, balance: lowest.balance },
    endBalance: months[months.length - 1]?.balance ?? input.startBalance,
  }
}

export type SignificantEvent = {
  month: string
  monthLabel: string
  name: string
  type: 'ingreso' | 'gasto'
  amount: number
}

export type MonthAlternative = {
  month: string
  monthLabel: string
  canAfford: boolean
  balanceAfter: number
  lowestBalance: number
  reason: string // e.g., "Después del aguinaldo" or "Mes con menos gastos"
}

export type InstallmentOption = {
  cuotas: number
  montoCuota: number
  /** true si puede pagar todas las cuotas sin quedar en negativo */
  viable: boolean
}

export type FinancingRecommendation =
  | 'cash' // Puede pagar en cash sin problemas
  | 'cuotas_recomendado' // Puede en cash pero hay gastos grandes próximos
  | 'cuotas_necesario' // Solo llega con cuotas
  | 'credito' // No llega pero está cerca, sugerir crédito
  | 'ahorrar' // Está lejos, necesita plan de ahorro

export type AffordabilityResult = {
  targetMonth: string
  targetMonthLabel: string
  /** Monto pedido, expresado en pesos de hoy. */
  requestedTodayPesos: number
  /** Monto pedido ajustado a pesos del mes objetivo. */
  requestedInTargetPesos: number
  inflationFactor: number
  canAfford: boolean
  /** Saldo mínimo proyectado desde el mes objetivo hasta el fin del horizonte, ya descontando el gasto. */
  lowestBalanceAfter: number
  lowestBalanceMonthLabel: string
  /** Saldo proyectado al cierre del mes objetivo sin el gasto. */
  balanceAtTargetWithout: number
  /** Saldo proyectado al cierre del mes objetivo con el gasto. */
  balanceAtTargetWith: number
  /** Máximo gasto que se puede hacer ese mes sin quedar en negativo, en pesos del mes objetivo. */
  maxAffordableInTargetPesos: number
  /** Idem, expresado en pesos de hoy. */
  maxAffordableTodayPesos: number
  horizonMonths: number
  /** Desglose mensual mostrando cómo evoluciona el saldo */
  monthlyBreakdown: Array<{
    month: string
    label: string
    income: number
    expense: number
    balance: number
    isTargetMonth: boolean
    isLowestMonth: boolean
  }>
  /** Eventos significativos en el período (aguinaldos, gastos grandes, etc.) */
  significantEvents: SignificantEvent[]
  /** Mejores meses alternativos para hacer el gasto */
  betterMonths: MonthAlternative[]

  // Nuevos campos para recomendaciones de financiamiento
  /** Porcentaje de cuánto le falta para llegar (0 = puede, 0.25 = le falta 25%) */
  gapPercentage: number
  /** Si está cerca de poder (gap < 30%) */
  isCloseToAffording: boolean
  /** Gastos grandes (>200k) en los 3 meses siguientes al mes objetivo */
  upcomingLargeExpenses: Array<{
    month: string
    monthLabel: string
    name: string
    amount: number
  }>
  /** Opciones de pago en cuotas */
  installmentOptions: InstallmentOption[]
  /** Recomendación de financiamiento */
  financingRecommendation: FinancingRecommendation
  /** Explicación de la recomendación */
  financingReason: string
}

export function evaluateExpense(input: {
  startBalance: number
  events: FinancialEvent[]
  settings: Settings
  /** yyyy-MM */
  targetMonth: string
  /** Monto en pesos de hoy. */
  amountTodayPesos: number
  adjustForInflation: boolean
  horizonMonths?: number
  today?: Date
}): AffordabilityResult | { error: string } {
  const today = startOfDay(input.today ?? new Date())
  const targetStart = parseISO(`${input.targetMonth}-01`)
  if (Number.isNaN(targetStart.getTime())) return { error: 'Mes objetivo inválido (usar yyyy-MM).' }

  const monthsAhead = differenceInCalendarMonths(targetStart, today)
  if (monthsAhead < 0) return { error: 'El mes objetivo ya pasó.' }

  const horizonMonths = Math.min(Math.max(input.horizonMonths ?? monthsAhead + 12, monthsAhead + 1), 60)
  const factor = input.adjustForInflation
    ? inflationFactor(input.settings.monthlyInflation, monthsAhead)
    : 1
  const requested = input.amountTodayPesos * factor
  const spendDate = monthsAhead === 0 ? today : targetStart

  const base = projectBalance({
    startBalance: input.startBalance,
    events: input.events,
    settings: input.settings,
    months: horizonMonths,
    today,
  })
  const withExpense = projectBalance({
    startBalance: input.startBalance,
    events: input.events,
    settings: input.settings,
    months: horizonMonths,
    today,
    extra: [{ date: spendDate, amount: -requested }],
  })

  const fromTarget = withExpense.months.slice(monthsAhead)
  const lowest = fromTarget.reduce((min, m) => (m.balance < min.balance ? m : min), fromTarget[0])
  const baseFromTarget = base.months.slice(monthsAhead)
  const maxAffordable = Math.max(0, Math.min(...baseFromTarget.map((m) => m.balance)))

  // Build monthly breakdown for the AI to explain
  const monthlyBreakdown = withExpense.months.map((m, idx) => ({
    month: m.month,
    label: m.label,
    income: m.income,
    expense: m.expense,
    balance: m.balance,
    isTargetMonth: idx === monthsAhead,
    isLowestMonth: m.month === lowest.month,
  }))

  // Find significant events (aguinaldos, matrículas, gastos esporádicos grandes, etc.)
  // Excluimos gastos recurrentes mensuales como alquiler, servicios, supermercado
  const horizon = endOfMonth(addMonths(today, horizonMonths - 1))
  const occurrences = getOccurrences(input.events, input.settings, today, horizon)

  // List of keywords that indicate truly sporadic/significant events
  const significantKeywords = [
    'aguinaldo', 'matrícula', 'renovación', 'patente', 'seguro anual',
    'vacaciones', 'viaje', 'bono', 'premio', 'herencia', 'venta',
    'mantenimiento', 'reparación', 'arreglo'
  ]
  // List of recurring expense names to EXCLUDE from "significant"
  const recurringNames = [
    'alquiler', 'expensas', 'sueldo', 'luz', 'gas', 'agua', 'internet',
    'teléfono', 'prepaga', 'gimnasio', 'netflix', 'spotify', 'streaming',
    'supermercado', 'combustible', 'restaurante', 'cuota colegio',
    'gastos fijos', 'servicios'
  ]

  const significantEvents: SignificantEvent[] = occurrences
    .filter(o => {
      const nameLower = o.name.toLowerCase()
      // Check if it matches significant keywords
      const isSignificantKeyword = significantKeywords.some(kw => nameLower.includes(kw))
      // Check if it's NOT a recurring expense
      const isRecurring = recurringNames.some(rn => nameLower.includes(rn))

      if (isSignificantKeyword) return true
      if (isRecurring) return false
      // For other expenses, only include if > 500k (truly large one-off)
      return Math.abs(o.amount) > 500000
    })
    .map(o => ({
      month: format(o.date, 'yyyy-MM'),
      monthLabel: monthLabel(o.date),
      name: o.name,
      type: o.type,
      amount: Math.round(Math.abs(o.amount)),
    }))
    // Remove duplicates (same name in same month)
    .filter((e, idx, arr) => arr.findIndex(x => x.month === e.month && x.name === e.name) === idx)

  // Find better alternative months
  const betterMonths: MonthAlternative[] = []
  const monthsToCheck = Math.min(18, horizonMonths) // Check up to 18 months ahead

  for (let i = 0; i < monthsToCheck; i++) {
    if (i === monthsAhead) continue // Skip the target month

    const altMonthStart = addMonths(today, i)
    const altMonth = format(altMonthStart, 'yyyy-MM')
    const altFactor = input.adjustForInflation
      ? inflationFactor(input.settings.monthlyInflation, i)
      : 1
    const altRequested = input.amountTodayPesos * altFactor
    const altSpendDate = i === 0 ? today : altMonthStart

    const altProjection = projectBalance({
      startBalance: input.startBalance,
      events: input.events,
      settings: input.settings,
      months: horizonMonths,
      today,
      extra: [{ date: altSpendDate, amount: -altRequested }],
    })

    const altFromTarget = altProjection.months.slice(i)
    const altLowest = altFromTarget.reduce((min, m) => (m.balance < min.balance ? m : min), altFromTarget[0])
    const altCanAfford = altLowest.balance >= 0

    // Determine reason for this month
    let reason = ''
    const monthNum = altMonthStart.getMonth()
    const hasAguinaldo = significantEvents.some(e =>
      e.month === altMonth && e.name.toLowerCase().includes('aguinaldo')
    )
    const prevMonthHasAguinaldo = significantEvents.some(e => {
      const prevMonth = format(addMonths(altMonthStart, -1), 'yyyy-MM')
      return e.month === prevMonth && e.name.toLowerCase().includes('aguinaldo')
    })

    if (hasAguinaldo) {
      reason = 'Mes con aguinaldo'
    } else if (prevMonthHasAguinaldo) {
      reason = 'Después del aguinaldo'
    } else if (monthNum === 0) {
      reason = 'Inicio de año'
    } else if (base.months[i]?.expense < base.months[monthsAhead]?.expense * 0.8) {
      reason = 'Mes con menos gastos'
    } else if (altCanAfford && !lowest.balance) {
      reason = 'Mejor situación financiera'
    }

    if (altCanAfford || altLowest.balance > lowest.balance + 100000) {
      betterMonths.push({
        month: altMonth,
        monthLabel: monthLabel(altMonthStart),
        canAfford: altCanAfford,
        balanceAfter: altProjection.months[i].balance,
        lowestBalance: altLowest.balance,
        reason: reason || (altCanAfford ? 'Llegás sin problemas' : 'Mejor que el mes elegido'),
      })
    }
  }

  // Sort better months: first those where you can afford, then by lowest balance
  betterMonths.sort((a, b) => {
    if (a.canAfford && !b.canAfford) return -1
    if (!a.canAfford && b.canAfford) return 1
    return b.lowestBalance - a.lowestBalance
  })

  // Calculate financing-related fields
  const canAfford = lowest.balance >= 0
  const gapPercentage = canAfford ? 0 : Math.min(1, (requested - maxAffordable) / requested)
  const isCloseToAffording = !canAfford && gapPercentage < 0.30

  // Find large expenses in the 3 months after the target month
  const upcomingLargeExpenses = significantEvents
    .filter(e => {
      const eventMonth = parseISO(`${e.month}-01`)
      const targetMonth = parseISO(`${input.targetMonth}-01`)
      const monthsDiff = differenceInCalendarMonths(eventMonth, targetMonth)
      return e.type === 'gasto' && e.amount > 200000 && monthsDiff > 0 && monthsDiff <= 3
    })
    .map(e => ({
      month: e.month,
      monthLabel: e.monthLabel,
      name: e.name,
      amount: e.amount,
    }))

  // Calculate installment options (3, 6, 12 cuotas)
  const installmentOptions: Array<{ cuotas: number; montoCuota: number; viable: boolean }> = []
  for (const numCuotas of [3, 6, 12]) {
    const montoCuota = Math.round(requested / numCuotas)
    // Simulate paying in installments
    const cuotaDates = Array.from({ length: numCuotas }, (_, i) =>
      addMonths(spendDate, i)
    )
    const cuotaProjection = projectBalance({
      startBalance: input.startBalance,
      events: input.events,
      settings: input.settings,
      months: Math.max(horizonMonths, monthsAhead + numCuotas + 3),
      today,
      extra: cuotaDates.map(date => ({ date, amount: -montoCuota })),
    })
    const cuotaLowest = cuotaProjection.months.reduce(
      (min, m) => (m.balance < min.balance ? m : min),
      cuotaProjection.months[0]
    )
    installmentOptions.push({
      cuotas: numCuotas,
      montoCuota,
      viable: cuotaLowest.balance >= 0,
    })
  }

  // Determine financing recommendation
  let financingRecommendation: 'cash' | 'cuotas_recomendado' | 'cuotas_necesario' | 'credito' | 'ahorrar'
  let financingReason: string

  if (canAfford) {
    if (upcomingLargeExpenses.length > 0) {
      // Can afford but has big expenses coming
      const biggestUpcoming = upcomingLargeExpenses[0]
      financingRecommendation = 'cuotas_recomendado'
      financingReason = `Podés pagarlo en cash, pero en ${biggestUpcoming.monthLabel} tenés ${biggestUpcoming.name} (~$${biggestUpcoming.amount.toLocaleString('es-AR')}). Te conviene pagar en cuotas para mantener liquidez.`
    } else if (lowest.balance < 300000) {
      // Can afford but leaves tight
      financingRecommendation = 'cuotas_recomendado'
      financingReason = `Podés pagarlo, pero te quedaría muy justo ($${lowest.balance.toLocaleString('es-AR')} en ${lowest.label}). Considerá pagarlo en cuotas para tener más margen.`
    } else {
      financingRecommendation = 'cash'
      financingReason = 'Tenés margen suficiente para pagarlo en cash sin problemas.'
    }
  } else {
    // Can't afford in cash
    const viableInstallment = installmentOptions.find(o => o.viable)
    if (viableInstallment) {
      financingRecommendation = 'cuotas_necesario'
      financingReason = `En cash no llegás, pero en ${viableInstallment.cuotas} cuotas de $${viableInstallment.montoCuota.toLocaleString('es-AR')} sí podrías.`
    } else if (isCloseToAffording) {
      financingRecommendation = 'credito'
      const gap = Math.round(requested - maxAffordable)
      financingReason = `Te faltan ~$${gap.toLocaleString('es-AR')} (${Math.round(gapPercentage * 100)}% del monto). Podrías cubrirlo con un préstamo personal o tarjeta de crédito.`
    } else {
      // Far from affording
      financingRecommendation = 'ahorrar'
      const monthlyNet = base.months.reduce((sum, m) => sum + m.net, 0) / base.months.length
      const monthsToSave = monthlyNet > 0 ? Math.ceil((requested - maxAffordable) / monthlyNet) : 0
      financingReason = monthsToSave > 0 && monthsToSave < 24
        ? `Necesitás ahorrar ~${monthsToSave} meses más para llegar.`
        : 'Está fuera de tu alcance actual. Revisá si podés ajustar el presupuesto o buscar una opción más económica.'
    }
  }

  return {
    targetMonth: input.targetMonth,
    targetMonthLabel: base.months[monthsAhead].label,
    requestedTodayPesos: Math.round(input.amountTodayPesos),
    requestedInTargetPesos: Math.round(requested),
    inflationFactor: Number(factor.toFixed(3)),
    canAfford,
    lowestBalanceAfter: lowest.balance,
    lowestBalanceMonthLabel: lowest.label,
    balanceAtTargetWithout: base.months[monthsAhead].balance,
    balanceAtTargetWith: withExpense.months[monthsAhead].balance,
    maxAffordableInTargetPesos: Math.round(maxAffordable),
    maxAffordableTodayPesos: Math.round(maxAffordable / factor),
    horizonMonths,
    monthlyBreakdown,
    significantEvents,
    betterMonths: betterMonths.slice(0, 5), // Top 5 alternatives
    // New financing fields
    gapPercentage: Number(gapPercentage.toFixed(3)),
    isCloseToAffording,
    upcomingLargeExpenses,
    installmentOptions,
    financingRecommendation,
    financingReason,
  }
}

import { addMonths, format, setDate, startOfMonth } from 'date-fns'
import type { FinancialEvent } from './types'

function nextDayOfMonth(day: number, from = new Date()) {
  const candidate = setDate(startOfMonth(from), day)
  return candidate < from ? setDate(startOfMonth(addMonths(from, 1)), day) : candidate
}

function nextSemesterPayment(from = new Date()) {
  const year = from.getFullYear()
  const candidates = [new Date(year, 5, 18), new Date(year, 11, 18), new Date(year + 1, 5, 18)]
  return candidates.find((d) => d > from) ?? candidates[2]
}

function nextMarch(from = new Date()) {
  const year = from.getMonth() >= 2 ? from.getFullYear() + 1 : from.getFullYear()
  return new Date(year, 2, 1)
}

const iso = (d: Date) => format(d, 'yyyy-MM-dd')

export function buildDemoEvents(): FinancialEvent[] {
  const id = () => crypto.randomUUID()
  return [
    {
      id: id(),
      type: 'ingreso',
      name: 'Sueldo',
      category: 'Sueldo',
      amount: 2_400_000,
      frequency: 'mensual',
      startDate: iso(nextDayOfMonth(5)),
      endDate: null,
      adjustsForInflation: true,
    },
    {
      id: id(),
      type: 'ingreso',
      name: 'Aguinaldo',
      category: 'Aguinaldo',
      amount: 1_200_000,
      frequency: 'semestral',
      startDate: iso(nextSemesterPayment()),
      endDate: null,
      adjustsForInflation: true,
    },
    {
      id: id(),
      type: 'gasto',
      name: 'Alquiler',
      category: 'Alquiler',
      amount: 780_000,
      frequency: 'mensual',
      startDate: iso(nextDayOfMonth(10)),
      endDate: null,
      adjustsForInflation: true,
    },
    {
      id: id(),
      type: 'gasto',
      name: 'Servicios (luz, gas, internet)',
      category: 'Servicios',
      amount: 190_000,
      frequency: 'mensual',
      startDate: iso(nextDayOfMonth(15)),
      endDate: null,
      adjustsForInflation: true,
    },
    {
      id: id(),
      type: 'gasto',
      name: 'Gastos de vida diaria',
      category: 'Otros',
      amount: 650_000,
      frequency: 'mensual',
      startDate: iso(nextDayOfMonth(1)),
      endDate: null,
      adjustsForInflation: true,
    },
    {
      id: id(),
      type: 'gasto',
      name: 'Matrícula',
      category: 'Educación',
      amount: 520_000,
      frequency: 'anual',
      startDate: iso(nextMarch()),
      endDate: null,
      adjustsForInflation: true,
    },
    {
      id: id(),
      type: 'gasto',
      name: 'Ganancias',
      category: 'Impuestos',
      amount: 310_000,
      frequency: 'trimestral',
      startDate: iso(nextDayOfMonth(20)),
      endDate: null,
      adjustsForInflation: true,
    },
  ]
}

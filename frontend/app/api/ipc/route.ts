import { NextResponse } from 'next/server'
import {
  IPC_HISTORY,
  getAverageIPC,
  calculateAccumulatedIPC,
} from '@/lib/recurring-expenses/ipc-data'

export async function GET() {
  const latest = IPC_HISTORY[IPC_HISTORY.length - 1]
  const avgLast3 = getAverageIPC(3, IPC_HISTORY)
  const avgLast6 = getAverageIPC(6, IPC_HISTORY)
  const avgLast12 = getAverageIPC(12, IPC_HISTORY)

  // Calcular acumulado del año actual
  const currentYear = new Date().getFullYear()
  const startOfYear = `${currentYear}-01`
  const currentMonth = `${currentYear}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
  const ytdAccumulated = calculateAccumulatedIPC(startOfYear, currentMonth, IPC_HISTORY)

  // Últimos 12 meses
  const last12Months = IPC_HISTORY.slice(-12)

  return NextResponse.json({
    current: {
      month: latest.month,
      monthlyVariation: latest.monthlyVariation,
      yearOverYear: latest.yearOverYear,
      source: latest.source,
    },
    averages: {
      last3Months: Math.round(avgLast3 * 100) / 100,
      last6Months: Math.round(avgLast6 * 100) / 100,
      last12Months: Math.round(avgLast12 * 100) / 100,
    },
    yearToDate: {
      accumulated: Math.round(ytdAccumulated * 100) / 100,
      year: currentYear,
    },
    history: last12Months.map(d => ({
      month: d.month,
      label: new Date(d.month + '-01').toLocaleDateString('es-AR', { month: 'short', year: '2-digit' }),
      value: d.monthlyVariation,
      yoy: d.yearOverYear,
      source: d.source,
    })),
    meta: {
      totalDataPoints: IPC_HISTORY.length,
      firstMonth: IPC_HISTORY[0].month,
      lastMonth: latest.month,
      dataSource: 'INDEC - Índice de Precios al Consumidor',
    },
  })
}

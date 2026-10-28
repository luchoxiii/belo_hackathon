import type { IPCDataPoint } from './types'

// Datos históricos de IPC Argentina (INDEC)
// Fuente: https://www.indec.gob.ar/indec/web/Nivel4-Tema-3-5-31
// Variación mensual del IPC Nacional

export const IPC_HISTORY: IPCDataPoint[] = [
  // 2022
  { month: '2022-01', monthlyVariation: 3.9, yearOverYear: 50.7, source: 'indec' },
  { month: '2022-02', monthlyVariation: 4.7, yearOverYear: 52.3, source: 'indec' },
  { month: '2022-03', monthlyVariation: 6.7, yearOverYear: 55.1, source: 'indec' },
  { month: '2022-04', monthlyVariation: 6.0, yearOverYear: 58.0, source: 'indec' },
  { month: '2022-05', monthlyVariation: 5.1, yearOverYear: 60.7, source: 'indec' },
  { month: '2022-06', monthlyVariation: 5.3, yearOverYear: 64.0, source: 'indec' },
  { month: '2022-07', monthlyVariation: 7.4, yearOverYear: 71.0, source: 'indec' },
  { month: '2022-08', monthlyVariation: 7.0, yearOverYear: 78.5, source: 'indec' },
  { month: '2022-09', monthlyVariation: 6.2, yearOverYear: 83.0, source: 'indec' },
  { month: '2022-10', monthlyVariation: 6.3, yearOverYear: 88.0, source: 'indec' },
  { month: '2022-11', monthlyVariation: 4.9, yearOverYear: 92.4, source: 'indec' },
  { month: '2022-12', monthlyVariation: 5.1, yearOverYear: 94.8, source: 'indec' },

  // 2023
  { month: '2023-01', monthlyVariation: 6.0, yearOverYear: 98.8, source: 'indec' },
  { month: '2023-02', monthlyVariation: 6.6, yearOverYear: 102.5, source: 'indec' },
  { month: '2023-03', monthlyVariation: 7.7, yearOverYear: 104.3, source: 'indec' },
  { month: '2023-04', monthlyVariation: 8.4, yearOverYear: 108.8, source: 'indec' },
  { month: '2023-05', monthlyVariation: 7.8, yearOverYear: 114.2, source: 'indec' },
  { month: '2023-06', monthlyVariation: 6.0, yearOverYear: 115.6, source: 'indec' },
  { month: '2023-07', monthlyVariation: 6.3, yearOverYear: 113.4, source: 'indec' },
  { month: '2023-08', monthlyVariation: 12.4, yearOverYear: 124.4, source: 'indec' },
  { month: '2023-09', monthlyVariation: 12.7, yearOverYear: 138.3, source: 'indec' },
  { month: '2023-10', monthlyVariation: 8.3, yearOverYear: 142.7, source: 'indec' },
  { month: '2023-11', monthlyVariation: 12.8, yearOverYear: 160.9, source: 'indec' },
  { month: '2023-12', monthlyVariation: 25.5, yearOverYear: 211.4, source: 'indec' },

  // 2024
  { month: '2024-01', monthlyVariation: 20.6, yearOverYear: 254.2, source: 'indec' },
  { month: '2024-02', monthlyVariation: 13.2, yearOverYear: 276.2, source: 'indec' },
  { month: '2024-03', monthlyVariation: 11.0, yearOverYear: 287.9, source: 'indec' },
  { month: '2024-04', monthlyVariation: 8.8, yearOverYear: 289.4, source: 'indec' },
  { month: '2024-05', monthlyVariation: 4.2, yearOverYear: 276.4, source: 'indec' },
  { month: '2024-06', monthlyVariation: 4.6, yearOverYear: 271.5, source: 'indec' },
  { month: '2024-07', monthlyVariation: 4.0, yearOverYear: 263.4, source: 'indec' },
  { month: '2024-08', monthlyVariation: 4.2, yearOverYear: 236.7, source: 'indec' },
  { month: '2024-09', monthlyVariation: 3.5, yearOverYear: 209.0, source: 'indec' },
  { month: '2024-10', monthlyVariation: 2.7, yearOverYear: 193.0, source: 'indec' },
  { month: '2024-11', monthlyVariation: 2.4, yearOverYear: 166.0, source: 'indec' },
  { month: '2024-12', monthlyVariation: 2.7, yearOverYear: 117.8, source: 'indec' },

  // 2025 (datos hasta donde estén disponibles + estimaciones)
  { month: '2025-01', monthlyVariation: 2.2, yearOverYear: 84.5, source: 'indec' },
  { month: '2025-02', monthlyVariation: 2.4, yearOverYear: 66.9, source: 'indec' },
  { month: '2025-03', monthlyVariation: 3.7, yearOverYear: 55.9, source: 'indec' },
  { month: '2025-04', monthlyVariation: 2.8, yearOverYear: 47.3, source: 'indec' },
  // Estimaciones para meses futuros
  { month: '2025-05', monthlyVariation: 2.5, source: 'estimate' },
  { month: '2025-06', monthlyVariation: 2.5, source: 'estimate' },
  { month: '2025-07', monthlyVariation: 2.5, source: 'estimate' },
  { month: '2025-08', monthlyVariation: 2.5, source: 'estimate' },
  { month: '2025-09', monthlyVariation: 2.5, source: 'estimate' },
  { month: '2025-10', monthlyVariation: 2.5, source: 'estimate' },
  { month: '2025-11', monthlyVariation: 2.5, source: 'estimate' },
  { month: '2025-12', monthlyVariation: 2.5, source: 'estimate' },
]

// Calcular IPC acumulado entre dos fechas
export function calculateAccumulatedIPC(
  fromMonth: string,
  toMonth: string,
  ipcData: IPCDataPoint[] = IPC_HISTORY
): number {
  const fromIndex = ipcData.findIndex(d => d.month === fromMonth)
  const toIndex = ipcData.findIndex(d => d.month === toMonth)

  if (fromIndex === -1 || toIndex === -1 || fromIndex >= toIndex) {
    return 0
  }

  // Calcular factor acumulado: (1 + ipc1/100) * (1 + ipc2/100) * ... - 1
  let factor = 1
  for (let i = fromIndex + 1; i <= toIndex; i++) {
    factor *= (1 + ipcData[i].monthlyVariation / 100)
  }

  return (factor - 1) * 100 // Retornar como porcentaje
}

// Obtener IPC de un mes específico
export function getIPCForMonth(
  month: string,
  ipcData: IPCDataPoint[] = IPC_HISTORY
): IPCDataPoint | null {
  return ipcData.find(d => d.month === month) || null
}

// Obtener IPC promedio de los últimos N meses
export function getAverageIPC(
  months: number = 3,
  ipcData: IPCDataPoint[] = IPC_HISTORY
): number {
  const recentData = ipcData.slice(-months)
  if (recentData.length === 0) return 0

  const sum = recentData.reduce((acc, d) => acc + d.monthlyVariation, 0)
  return sum / recentData.length
}

// Proyectar monto futuro con IPC
export function projectAmountWithIPC(
  baseAmount: number,
  fromMonth: string,
  toMonth: string,
  ipcData: IPCDataPoint[] = IPC_HISTORY,
  estimatedFutureIPC: number = 2.5
): number {
  const fromIndex = ipcData.findIndex(d => d.month === fromMonth)
  let toIndex = ipcData.findIndex(d => d.month === toMonth)

  if (fromIndex === -1) return baseAmount

  // Si el mes destino no existe en los datos, calcular cuántos meses faltan
  let extraMonths = 0
  if (toIndex === -1) {
    const lastMonth = ipcData[ipcData.length - 1].month
    const [lastYear, lastMonthNum] = lastMonth.split('-').map(Number)
    const [toYear, toMonthNum] = toMonth.split('-').map(Number)

    extraMonths = (toYear - lastYear) * 12 + (toMonthNum - lastMonthNum)
    toIndex = ipcData.length - 1
  }

  // Calcular con datos históricos
  let factor = 1
  for (let i = fromIndex + 1; i <= toIndex; i++) {
    factor *= (1 + ipcData[i].monthlyVariation / 100)
  }

  // Agregar meses estimados
  if (extraMonths > 0) {
    factor *= Math.pow(1 + estimatedFutureIPC / 100, extraMonths)
  }

  return Math.round(baseAmount * factor)
}

// Calcular cuánto debería ser un ajuste según IPC acumulado
export function calculateIPCAdjustment(
  lastAdjustmentMonth: string,
  currentMonth: string,
  ipcData: IPCDataPoint[] = IPC_HISTORY
): { accumulated: number; factor: number } {
  const accumulated = calculateAccumulatedIPC(lastAdjustmentMonth, currentMonth, ipcData)
  return {
    accumulated,
    factor: 1 + accumulated / 100,
  }
}

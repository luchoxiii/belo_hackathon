import { v4 as uuidv4 } from 'uuid'
import {
  Transaction,
  Account,
  UserProfile,
  MockDataset,
  TransactionCategory,
  TransactionMethod,
  CryptoAsset,
} from './types'

// ============================================
// CONFIGURACIÓN DEL PERFIL FAMILIAR
// ============================================

const FAMILY_PROFILE: UserProfile = {
  id: uuidv4(),
  name: 'Martín Rodríguez',
  familyMembers: [
    {
      name: 'Luciana',
      relationship: 'spouse',
      birthDate: '1988-03-15',
    },
    {
      name: 'Valentina',
      relationship: 'child',
      birthDate: '2016-09-22', // ~8 años, primaria
    },
  ],
  employment: {
    type: 'empleado',
    company: 'Tech Solutions SA',
    position: 'Senior Developer',
    monthlySalary: 2_400_000, // Salario clase media-alta argentina
    payDay: 5,
  },
  location: {
    city: 'Buenos Aires',
    province: 'CABA',
  },
}

// ============================================
// TASAS DE INFLACIÓN MENSUAL HISTÓRICA (Argentina)
// ============================================

// Inflación mensual aproximada por mes (2022-2024)
const MONTHLY_INFLATION: Record<string, number> = {
  '2022-10': 0.065, '2022-11': 0.048, '2022-12': 0.051,
  '2023-01': 0.060, '2023-02': 0.066, '2023-03': 0.073,
  '2023-04': 0.085, '2023-05': 0.076, '2023-06': 0.060,
  '2023-07': 0.064, '2023-08': 0.124, '2023-09': 0.127,
  '2023-10': 0.083, '2023-11': 0.129, '2023-12': 0.254,
  '2024-01': 0.204, '2024-02': 0.134, '2024-03': 0.110,
  '2024-04': 0.088, '2024-05': 0.044, '2024-06': 0.046,
  '2024-07': 0.040, '2024-08': 0.042, '2024-09': 0.035,
  '2024-10': 0.028,
}

// ============================================
// PRECIOS CRYPTO HISTÓRICOS (ARS aproximados)
// ============================================

const CRYPTO_PRICES: Record<string, Record<CryptoAsset, number>> = {
  '2022-10': { BTC: 6_500_000, ETH: 450_000, USDT: 295, USDC: 295, SOL: 11_000, DAI: 295 },
  '2023-01': { BTC: 7_800_000, ETH: 520_000, USDT: 365, USDC: 365, SOL: 15_000, DAI: 365 },
  '2023-06': { BTC: 13_500_000, ETH: 950_000, USDT: 520, USDC: 520, SOL: 25_000, DAI: 520 },
  '2023-12': { BTC: 35_000_000, ETH: 2_200_000, USDT: 950, USDC: 950, SOL: 85_000, DAI: 950 },
  '2024-03': { BTC: 62_000_000, ETH: 3_200_000, USDT: 1050, USDC: 1050, SOL: 145_000, DAI: 1050 },
  '2024-06': { BTC: 58_000_000, ETH: 2_900_000, USDT: 1150, USDC: 1150, SOL: 120_000, DAI: 1150 },
  '2024-10': { BTC: 65_000_000, ETH: 2_600_000, USDT: 1050, USDC: 1050, SOL: 155_000, DAI: 1050 },
}

// ============================================
// UTILIDADES
// ============================================

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function randomFloat(min: number, max: number, decimals: number = 2): number {
  const value = Math.random() * (max - min) + min
  return Number(value.toFixed(decimals))
}

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

function formatDateTime(date: Date): string {
  return date.toISOString()
}

function getMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date)
  result.setMonth(result.getMonth() + months)
  return result
}

// Obtiene precio crypto interpolado para una fecha
function getCryptoPrice(date: Date, asset: CryptoAsset): number {
  const monthKey = getMonthKey(date)
  const keys = Object.keys(CRYPTO_PRICES).sort()

  // Encuentra el precio más cercano
  let priceKey = keys[0]
  for (const key of keys) {
    if (key <= monthKey) priceKey = key
  }

  return CRYPTO_PRICES[priceKey][asset]
}

// Calcula factor de inflación acumulada desde fecha base
function getInflationFactor(fromDate: Date, toDate: Date): number {
  let factor = 1
  const current = new Date(fromDate)

  while (current < toDate) {
    const monthKey = getMonthKey(current)
    const inflation = MONTHLY_INFLATION[monthKey] ?? 0.04 // Default 4%
    factor *= (1 + inflation)
    current.setMonth(current.getMonth() + 1)
  }

  return factor
}

// Ajusta monto por inflación desde octubre 2024
function adjustForInflation(baseAmount: number, targetDate: Date, baseDate: Date = new Date('2024-10-01')): number {
  const factor = getInflationFactor(targetDate, baseDate)
  return Math.round(baseAmount / factor)
}

// ============================================
// GENERADORES DE TRANSACCIONES
// ============================================

function createTransaction(
  date: Date,
  type: 'credit' | 'debit',
  category: TransactionCategory,
  amount: number,
  description: string,
  method: TransactionMethod,
  extras: Partial<Transaction> = {}
): Transaction {
  return {
    id: uuidv4(),
    type,
    category,
    amount: Math.abs(amount),
    currency: 'ARS',
    amountArs: Math.abs(amount),
    description,
    method,
    createdAt: formatDateTime(date),
    ...extras,
  }
}

// Genera salario mensual
function* generateSalary(startDate: Date, endDate: Date, profile: UserProfile): Generator<Transaction> {
  const baseSalary = profile.employment.monthlySalary
  const payDay = profile.employment.payDay
  const current = new Date(startDate)
  current.setDate(payDay)

  while (current <= endDate) {
    const salary = adjustForInflation(baseSalary, current)
    yield createTransaction(
      current,
      'credit',
      'salario',
      salary,
      `Haberes ${profile.employment.company}`,
      'transferencia',
      { merchant: profile.employment.company }
    )

    // Aguinaldo en junio y diciembre
    if (current.getMonth() === 5 || current.getMonth() === 11) {
      const aguinaldo = Math.round(salary / 2)
      const aguinaldoDate = new Date(current)
      aguinaldoDate.setDate(18) // SAC suele pagarse antes del 18

      yield createTransaction(
        aguinaldoDate,
        'credit',
        'aguinaldo',
        aguinaldo,
        `SAC ${current.getMonth() === 5 ? '1er' : '2do'} semestre`,
        'transferencia',
        { merchant: profile.employment.company }
      )
    }

    current.setMonth(current.getMonth() + 1)
  }
}

// Genera alquiler mensual
function* generateRent(startDate: Date, endDate: Date): Generator<Transaction> {
  const baseRent = 550_000 // Base octubre 2024 - 2 ambientes zona media
  const current = new Date(startDate)
  current.setDate(10) // Vence el 10 de cada mes

  while (current <= endDate) {
    const rent = adjustForInflation(baseRent, current)
    yield createTransaction(
      current,
      'debit',
      'alquiler',
      rent,
      'Alquiler mensual depto 3 ambientes',
      'transferencia',
      { merchant: 'Inmobiliaria Fernández' }
    )

    current.setMonth(current.getMonth() + 1)
  }
}

// Genera expensas
function* generateExpensas(startDate: Date, endDate: Date): Generator<Transaction> {
  const baseExpensas = 180_000
  const current = new Date(startDate)
  current.setDate(15)

  while (current <= endDate) {
    const expensas = adjustForInflation(baseExpensas, current)
    // Variación por gastos extraordinarios ocasionales
    const variation = Math.random() > 0.8 ? randomBetween(20000, 80000) : 0
    yield createTransaction(
      current,
      'debit',
      'expensas',
      expensas + adjustForInflation(variation, current),
      variation > 0 ? 'Expensas + extraordinarias' : 'Expensas ordinarias',
      'debito_automatico',
      { merchant: 'Consorcio Av. Corrientes 1234' }
    )

    current.setMonth(current.getMonth() + 1)
  }
}

// Genera servicios (luz, gas, agua, internet, teléfono)
function* generateServices(startDate: Date, endDate: Date): Generator<Transaction> {
  const services = [
    { category: 'luz' as const, merchant: 'Edenor', baseAmount: 45_000, day: 12 },
    { category: 'gas' as const, merchant: 'Metrogas', baseAmount: 25_000, day: 18 },
    { category: 'agua' as const, merchant: 'AySA', baseAmount: 12_000, day: 20 },
    { category: 'internet' as const, merchant: 'Fibertel', baseAmount: 35_000, day: 8 },
    { category: 'telefono' as const, merchant: 'Personal', baseAmount: 28_000, day: 5 },
  ]

  for (const service of services) {
    const current = new Date(startDate)
    current.setDate(service.day)

    while (current <= endDate) {
      const amount = adjustForInflation(service.baseAmount, current)
      // Variación estacional (más luz/gas en invierno/verano)
      let seasonalFactor = 1
      const month = current.getMonth()
      if (service.category === 'luz' && (month >= 11 || month <= 2)) seasonalFactor = 1.4
      if (service.category === 'gas' && month >= 5 && month <= 8) seasonalFactor = 2.5
      if (service.category === 'luz' && month >= 5 && month <= 8) seasonalFactor = 0.7

      yield createTransaction(
        current,
        'debit',
        service.category,
        Math.round(amount * seasonalFactor),
        `Factura ${service.merchant}`,
        'debito_automatico',
        { merchant: service.merchant }
      )

      current.setMonth(current.getMonth() + 1)
    }
  }
}

// Genera impuestos
function* generateTaxes(startDate: Date, endDate: Date): Generator<Transaction> {
  // ABL bimestral
  const current = new Date(startDate)
  current.setDate(15)
  const baseAbl = 35_000

  while (current <= endDate) {
    if (current.getMonth() % 2 === 0) { // Bimestral
      yield createTransaction(
        current,
        'debit',
        'abl',
        adjustForInflation(baseAbl, current),
        'ABL - Alumbrado, Barrido y Limpieza',
        'debito_automatico',
        { merchant: 'AGIP CABA' }
      )
    }
    current.setMonth(current.getMonth() + 1)
  }

  // Ganancias trimestral (anticipos)
  const gananciasDate = new Date(startDate)
  gananciasDate.setDate(20)
  const baseGanancias = 280_000

  while (gananciasDate <= endDate) {
    if ([2, 5, 8, 11].includes(gananciasDate.getMonth())) {
      yield createTransaction(
        gananciasDate,
        'debit',
        'impuesto_ganancias',
        adjustForInflation(baseGanancias, gananciasDate),
        `Anticipo Ganancias ${gananciasDate.getMonth() < 6 ? '1er' : '2do'} semestre`,
        'transferencia',
        { merchant: 'AFIP' }
      )
    }
    gananciasDate.setMonth(gananciasDate.getMonth() + 1)
  }
}

// Genera gastos de educación (hija en escuela semi-privada)
function* generateEducation(startDate: Date, endDate: Date): Generator<Transaction> {
  const baseCuota = 120_000 // Cuota escolar semi-privada/subvencionada
  const baseMatricula = 180_000 // Matrícula anual
  const current = new Date(startDate)

  while (current <= endDate) {
    const month = current.getMonth()

    // Matrícula en febrero
    if (month === 1) {
      const matriculaDate = new Date(current)
      matriculaDate.setDate(randomBetween(10, 20))
      yield createTransaction(
        matriculaDate,
        'debit',
        'matricula_escolar',
        adjustForInflation(baseMatricula, current),
        'Matrícula escolar - Colegio San Martín',
        'transferencia',
        { merchant: 'Colegio San Martín' }
      )
    }

    // Cuota mensual (marzo a diciembre)
    if (month >= 2) {
      const cuotaDate = new Date(current)
      cuotaDate.setDate(10)
      yield createTransaction(
        cuotaDate,
        'debit',
        'cuota_colegio',
        adjustForInflation(baseCuota, current),
        'Cuota mensual colegio',
        'debito_automatico',
        { merchant: 'Colegio San Martín' }
      )
    }

    // Útiles escolares en febrero/marzo
    if (month === 1 || month === 2) {
      if (Math.random() > 0.5) {
        const utilesDate = new Date(current)
        utilesDate.setDate(randomBetween(5, 25))
        yield createTransaction(
          utilesDate,
          'debit',
          'utiles_escolares',
          adjustForInflation(randomBetween(80_000, 180_000), current),
          'Útiles escolares',
          'tarjeta_credito',
          {
            merchant: 'Librería Cúspide',
            card: { last4: '4532', brand: 'visa', installments: 3, currentInstallment: 1 }
          }
        )
      }
    }

    // Actividades extracurriculares (natación)
    if (month >= 2 && month <= 10) {
      const actividadDate = new Date(current)
      actividadDate.setDate(5)
      yield createTransaction(
        actividadDate,
        'debit',
        'actividad_extracurricular',
        adjustForInflation(85_000, current),
        'Natación - Club Ferro',
        'debito_automatico',
        { merchant: 'Club Ferro Carril Oeste' }
      )
    }

    current.setMonth(current.getMonth() + 1)
  }
}

// Genera suscripciones digitales
function* generateSubscriptions(startDate: Date, endDate: Date): Generator<Transaction> {
  const subscriptions = [
    { name: 'Netflix', category: 'debito_netflix' as const, baseAmount: 8_000, day: 15 },
    { name: 'Spotify Family', category: 'debito_spotify' as const, baseAmount: 5_500, day: 20 },
    { name: 'Gimnasio barrio', category: 'debito_gimnasio' as const, baseAmount: 28_000, day: 1 },
    { name: 'OSDE 210', category: 'debito_prepaga' as const, baseAmount: 180_000, day: 10 }, // Plan básico familiar
  ]

  for (const sub of subscriptions) {
    const current = new Date(startDate)
    current.setDate(sub.day)

    while (current <= endDate) {
      yield createTransaction(
        current,
        'debit',
        sub.category,
        adjustForInflation(sub.baseAmount, current),
        sub.name,
        'debito_automatico',
        { merchant: sub.name }
      )

      current.setMonth(current.getMonth() + 1)
    }
  }
}

// Genera compras con tarjeta de crédito
function* generateCreditCardPurchases(startDate: Date, endDate: Date): Generator<Transaction> {
  const current = new Date(startDate)

  while (current <= endDate) {
    // Supermercado: 4-6 veces por mes
    for (let i = 0; i < randomBetween(4, 6); i++) {
      const date = addDays(new Date(current.getFullYear(), current.getMonth(), 1), randomBetween(0, 27))
      if (date <= endDate) {
        yield createTransaction(
          date,
          'debit',
          'tarjeta_supermercado',
          adjustForInflation(randomBetween(45_000, 150_000), date),
          randomChoice(['Carrefour', 'Coto', 'Disco', 'Jumbo']),
          'tarjeta_credito',
          {
            merchant: randomChoice(['Carrefour', 'Coto', 'Disco', 'Jumbo']),
            card: { last4: '4532', brand: 'visa' }
          }
        )
      }
    }

    // Farmacia: 1-2 veces por mes
    for (let i = 0; i < randomBetween(1, 2); i++) {
      const date = addDays(new Date(current.getFullYear(), current.getMonth(), 1), randomBetween(0, 27))
      if (date <= endDate) {
        yield createTransaction(
          date,
          'debit',
          'tarjeta_farmacia',
          adjustForInflation(randomBetween(15_000, 80_000), date),
          randomChoice(['Farmacity', 'Farmacia del Pueblo']),
          'tarjeta_credito',
          {
            merchant: randomChoice(['Farmacity', 'Farmacia del Pueblo']),
            card: { last4: '4532', brand: 'visa' }
          }
        )
      }
    }

    // Restaurante: 2-4 veces por mes
    for (let i = 0; i < randomBetween(2, 4); i++) {
      const date = addDays(new Date(current.getFullYear(), current.getMonth(), 1), randomBetween(0, 27))
      if (date <= endDate) {
        yield createTransaction(
          date,
          'debit',
          'tarjeta_restaurante',
          adjustForInflation(randomBetween(35_000, 120_000), date),
          randomChoice(['La Cabrera', 'Don Julio', 'Sushi Club', 'McDonald\'s', 'Mostaza', 'Kentucky']),
          'tarjeta_credito',
          {
            merchant: randomChoice(['La Cabrera', 'Don Julio', 'Sushi Club', 'McDonald\'s', 'Mostaza']),
            card: { last4: '4532', brand: 'visa' }
          }
        )
      }
    }

    // Combustible: 3-4 veces por mes
    for (let i = 0; i < randomBetween(3, 4); i++) {
      const date = addDays(new Date(current.getFullYear(), current.getMonth(), 1), randomBetween(0, 27))
      if (date <= endDate) {
        yield createTransaction(
          date,
          'debit',
          'tarjeta_combustible',
          adjustForInflation(randomBetween(35_000, 70_000), date),
          randomChoice(['YPF', 'Shell', 'Axion']),
          'tarjeta_credito',
          {
            merchant: randomChoice(['YPF', 'Shell', 'Axion']),
            card: { last4: '4532', brand: 'visa' }
          }
        )
      }
    }

    // Ropa/indumentaria: 0-2 veces por mes
    if (Math.random() > 0.4) {
      const date = addDays(new Date(current.getFullYear(), current.getMonth(), 1), randomBetween(0, 27))
      if (date <= endDate) {
        const installments = randomChoice([1, 3, 6])
        yield createTransaction(
          date,
          'debit',
          'tarjeta_indumentaria',
          adjustForInflation(randomBetween(50_000, 250_000), date),
          randomChoice(['Zara', 'H&M', 'Falabella', 'Rapsodia', 'Mimo', 'Cheeky']),
          'tarjeta_credito',
          {
            merchant: randomChoice(['Zara', 'H&M', 'Falabella', 'Rapsodia']),
            card: {
              last4: '4532',
              brand: 'visa',
              installments: installments > 1 ? installments : undefined,
              currentInstallment: installments > 1 ? 1 : undefined
            }
          }
        )
      }
    }

    // Tecnología: ocasional (cada 2-3 meses)
    if (Math.random() > 0.7) {
      const date = addDays(new Date(current.getFullYear(), current.getMonth(), 1), randomBetween(0, 27))
      if (date <= endDate) {
        yield createTransaction(
          date,
          'debit',
          'tarjeta_tecnologia',
          adjustForInflation(randomBetween(80_000, 800_000), date),
          randomChoice(['MercadoLibre', 'Fravega', 'Garbarino', 'Compumundo']),
          'tarjeta_credito',
          {
            merchant: randomChoice(['MercadoLibre', 'Fravega', 'Garbarino']),
            card: { last4: '4532', brand: 'visa', installments: 12, currentInstallment: 1 }
          }
        )
      }
    }

    current.setMonth(current.getMonth() + 1)
  }
}

// Genera operaciones en crypto - ahorro pequeño, no segundo ingreso
function* generateCryptoInvestments(startDate: Date, endDate: Date): Generator<Transaction> {
  const current = new Date(startDate)
  let usdtHoldings = 500 // Arranca con poco

  while (current <= endDate) {
    // Compra pequeña de USDT ocasional (~20% de los meses, cuando sobra algo)
    if (Math.random() > 0.8) {
      const date = addDays(new Date(current.getFullYear(), current.getMonth(), 20), randomBetween(0, 5))
      if (date <= endDate) {
        const usdtPrice = getCryptoPrice(date, 'USDT')
        const usdAmount = randomBetween(50, 150) // 50-150 USD cuando puede
        const arsAmount = usdAmount * usdtPrice
        usdtHoldings += usdAmount

        yield createTransaction(
          date,
          'debit',
          'compra_crypto',
          arsAmount,
          `Compra ${usdAmount} USDT`,
          'crypto',
          {
            merchant: 'Belo',
            crypto: {
              asset: 'USDT',
              amount: usdAmount,
              priceArs: usdtPrice,
            }
          }
        )
      }
    }

    // Venta de USDT cuando necesita cubrir un gasto extra (~15% de los meses)
    if (Math.random() > 0.85 && usdtHoldings > 100) {
      const date = addDays(new Date(current.getFullYear(), current.getMonth(), 25), randomBetween(0, 3))
      if (date <= endDate) {
        const usdtPrice = getCryptoPrice(date, 'USDT')
        const usdAmount = Math.min(randomBetween(80, 200), usdtHoldings - 50)
        const arsAmount = usdAmount * usdtPrice
        usdtHoldings -= usdAmount

        yield createTransaction(
          date,
          'credit',
          'venta_crypto',
          arsAmount,
          `Venta ${usdAmount} USDT`,
          'crypto',
          {
            merchant: 'Belo',
            crypto: {
              asset: 'USDT',
              amount: usdAmount,
              priceArs: usdtPrice,
            }
          }
        )
      }
    }

    current.setMonth(current.getMonth() + 1)
  }
}

// Genera plazos fijos
function* generatePlazosFijos(startDate: Date, endDate: Date): Generator<Transaction> {
  let plazoFijoActive = false
  let plazoFijoAmount = 0
  let plazoFijoRate = 0
  let plazoFijoStart: Date | null = null

  const current = new Date(startDate)

  while (current <= endDate) {
    // Constituir plazo fijo si no hay uno activo (cada 2-3 meses)
    if (!plazoFijoActive && Math.random() > 0.5) {
      const date = addDays(new Date(current.getFullYear(), current.getMonth(), 1), randomBetween(1, 10))
      if (date <= endDate) {
        plazoFijoAmount = adjustForInflation(randomBetween(500_000, 1_500_000), date)
        plazoFijoRate = randomFloat(80, 120, 1) // TNA entre 80% y 120%
        plazoFijoStart = date
        plazoFijoActive = true

        yield createTransaction(
          date,
          'debit',
          'plazo_fijo_constitucion',
          plazoFijoAmount,
          `Constitución PF a 30 días - TNA ${plazoFijoRate}%`,
          'plazo_fijo',
          {
            merchant: 'Banco Galicia',
            investment: {
              type: 'plazo_fijo',
              rate: plazoFijoRate,
              maturityDate: formatDate(addDays(date, 30)),
            }
          }
        )
      }
    }

    // Vencimiento del plazo fijo (30 días después)
    if (plazoFijoActive && plazoFijoStart) {
      const maturityDate = addDays(plazoFijoStart, 30)
      if (maturityDate <= current && maturityDate <= endDate) {
        const interest = Math.round(plazoFijoAmount * (plazoFijoRate / 100) * (30 / 365))

        yield createTransaction(
          maturityDate,
          'credit',
          'plazo_fijo_vencimiento',
          plazoFijoAmount + interest,
          `Vencimiento PF + intereses ($${interest.toLocaleString('es-AR')})`,
          'plazo_fijo',
          {
            merchant: 'Banco Galicia',
            investment: {
              type: 'plazo_fijo',
              rate: plazoFijoRate,
            }
          }
        )

        // También registrar el interés como ingreso separado
        yield createTransaction(
          maturityDate,
          'credit',
          'interes_plazo_fijo',
          interest,
          `Intereses PF - TNA ${plazoFijoRate}%`,
          'plazo_fijo',
          {
            merchant: 'Banco Galicia',
            investment: {
              type: 'plazo_fijo',
              rate: plazoFijoRate,
            }
          }
        )

        plazoFijoActive = false
        plazoFijoStart = null
      }
    }

    current.setMonth(current.getMonth() + 1)
  }
}

// Genera gastos varios del hogar
function* generateMiscExpenses(startDate: Date, endDate: Date): Generator<Transaction> {
  const current = new Date(startDate)

  while (current <= endDate) {
    // Pediatra/médico (1-2 veces por mes)
    if (Math.random() > 0.5) {
      const date = addDays(new Date(current.getFullYear(), current.getMonth(), 1), randomBetween(0, 27))
      if (date <= endDate) {
        yield createTransaction(
          date,
          'debit',
          randomChoice(['pediatra', 'medico']),
          adjustForInflation(randomBetween(25_000, 80_000), date),
          randomChoice(['Consulta pediátrica', 'Consulta médica', 'Control de rutina']),
          'tarjeta_debito',
          { merchant: 'Centro Médico Palermo' }
        )
      }
    }

    // Mantenimiento auto (cada 3-4 meses)
    if (Math.random() > 0.75) {
      const date = addDays(new Date(current.getFullYear(), current.getMonth(), 1), randomBetween(0, 27))
      if (date <= endDate) {
        yield createTransaction(
          date,
          'debit',
          'mantenimiento_auto',
          adjustForInflation(randomBetween(80_000, 350_000), date),
          randomChoice(['Service 10.000km', 'Cambio de aceite', 'Cambio de cubiertas', 'Alineación y balanceo']),
          'tarjeta_credito',
          {
            merchant: 'Lubricentro Rápido',
            card: { last4: '4532', brand: 'visa', installments: 3, currentInstallment: 1 }
          }
        )
      }
    }

    // Peaje (4-8 veces por mes)
    for (let i = 0; i < randomBetween(4, 8); i++) {
      const date = addDays(new Date(current.getFullYear(), current.getMonth(), 1), randomBetween(0, 27))
      if (date <= endDate) {
        yield createTransaction(
          date,
          'debit',
          'peaje',
          adjustForInflation(randomBetween(800, 3_500), date),
          'Peaje Autopista',
          'tarjeta_debito',
          { merchant: 'Autopistas del Sol' }
        )
      }
    }

    // Uber/taxi ocasional
    if (Math.random() > 0.6) {
      for (let i = 0; i < randomBetween(1, 4); i++) {
        const date = addDays(new Date(current.getFullYear(), current.getMonth(), 1), randomBetween(0, 27))
        if (date <= endDate) {
          yield createTransaction(
            date,
            'debit',
            'uber_taxi',
            adjustForInflation(randomBetween(5_000, 25_000), date),
            'Uber',
            'tarjeta_debito',
            { merchant: 'Uber' }
          )
        }
      }
    }

    // Seguro auto (mensual)
    const seguroDate = new Date(current)
    seguroDate.setDate(1)
    yield createTransaction(
      seguroDate,
      'debit',
      'seguro_auto',
      adjustForInflation(85_000, current),
      'Seguro automotor - La Segunda',
      'debito_automatico',
      { merchant: 'La Segunda Seguros' }
    )

    current.setMonth(current.getMonth() + 1)
  }
}

// Genera transferencias recibidas (freelance ocasional, reembolsos, etc.)
function* generateMiscIncome(startDate: Date, endDate: Date): Generator<Transaction> {
  const current = new Date(startDate)

  while (current <= endDate) {
    // Trabajo freelance ocasional (~25% de los meses, no es ingreso fijo)
    if (Math.random() > 0.75) { // Solo 25% de los meses tiene ingreso extra
      const date = addDays(new Date(current.getFullYear(), current.getMonth(), 1), randomBetween(5, 25))
      if (date <= endDate) {
        yield createTransaction(
          date,
          'credit',
          'freelance',
          adjustForInflation(randomBetween(300_000, 900_000), date),
          randomChoice(['Proyecto web freelance', 'Consultoría IT', 'Desarrollo app', 'Asesoría técnica']),
          'transferencia',
          { merchant: randomChoice(['Cliente particular', 'Startup XYZ', 'Empresa Tech', 'Agencia Digital']) }
        )
      }
    }

    // Reembolso de gastos (ocasional)
    if (Math.random() > 0.8) {
      const date = addDays(new Date(current.getFullYear(), current.getMonth(), 1), randomBetween(1, 28))
      if (date <= endDate) {
        yield createTransaction(
          date,
          'credit',
          'reembolso',
          adjustForInflation(randomBetween(15_000, 80_000), date),
          randomChoice(['Reembolso viáticos', 'Reembolso compra', 'Devolución']),
          'transferencia',
          { merchant: 'Tech Solutions SA' }
        )
      }
    }

    current.setMonth(current.getMonth() + 1)
  }
}

// ============================================
// GENERADOR PRINCIPAL
// ============================================

export function generateMockDataset(
  yearsBack: number = 2,
  endDate: Date = new Date()
): MockDataset {
  const startDate = new Date(endDate)
  startDate.setFullYear(startDate.getFullYear() - yearsBack)
  startDate.setDate(1) // Empezar desde el primer día del mes

  const transactions: Transaction[] = []

  // Generar todas las transacciones
  const generators = [
    generateSalary(startDate, endDate, FAMILY_PROFILE),
    generateRent(startDate, endDate),
    generateExpensas(startDate, endDate),
    generateServices(startDate, endDate),
    generateTaxes(startDate, endDate),
    generateEducation(startDate, endDate),
    generateSubscriptions(startDate, endDate),
    generateCreditCardPurchases(startDate, endDate),
    generateCryptoInvestments(startDate, endDate),
    generatePlazosFijos(startDate, endDate),
    generateMiscExpenses(startDate, endDate),
    generateMiscIncome(startDate, endDate),
  ]

  for (const generator of generators) {
    for (const tx of generator) {
      transactions.push(tx)
    }
  }

  // Ordenar por fecha
  transactions.sort((a, b) =>
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  )

  // Calcular estadísticas
  const totalIncome = transactions
    .filter(t => t.type === 'credit')
    .reduce((sum, t) => sum + t.amountArs, 0)

  const totalExpenses = transactions
    .filter(t => t.type === 'debit')
    .reduce((sum, t) => sum + t.amountArs, 0)

  const monthsCount = yearsBack * 12

  // Crear cuentas mock - balance modesto, clase media real
  // Tiene algo ahorrado pero no una fortuna
  const accounts: Account[] = [
    {
      id: uuidv4(),
      type: 'checking',
      name: 'Cuenta Belo',
      currency: 'ARS',
      balance: {
        currency: 'ARS',
        available: 2_800_000, // ~1 mes de sueldo ahorrado
        updatedAt: new Date().toISOString(),
      },
      alias: 'martin.rodriguez.belo',
    },
    {
      id: uuidv4(),
      type: 'crypto',
      name: 'Wallet BTC',
      currency: 'BTC',
      balance: {
        currency: 'BTC',
        available: 0.002, // Muy poco BTC (~$130 USD)
        updatedAt: new Date().toISOString(),
      },
    },
    {
      id: uuidv4(),
      type: 'crypto',
      name: 'Wallet USDT',
      currency: 'USDT',
      balance: {
        currency: 'USDT',
        available: 450, // ~$450 USD guardados
        updatedAt: new Date().toISOString(),
      },
    },
  ]

  return {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    profile: FAMILY_PROFILE,
    accounts,
    transactions,
    dateRange: {
      from: formatDate(startDate),
      to: formatDate(endDate),
    },
    stats: {
      totalTransactions: transactions.length,
      totalIncome: Math.round(totalIncome),
      totalExpenses: Math.round(totalExpenses),
      averageMonthlyIncome: Math.round(totalIncome / monthsCount),
      averageMonthlyExpenses: Math.round(totalExpenses / monthsCount),
    },
  }
}

// Función auxiliar para generar y guardar
export function generateAndSave(): MockDataset {
  const dataset = generateMockDataset(2)
  console.log(`Generated ${dataset.stats.totalTransactions} transactions`)
  console.log(`Date range: ${dataset.dateRange.from} to ${dataset.dateRange.to}`)
  console.log(`Total income: $${dataset.stats.totalIncome.toLocaleString('es-AR')}`)
  console.log(`Total expenses: $${dataset.stats.totalExpenses.toLocaleString('es-AR')}`)
  console.log(`Net: $${(dataset.stats.totalIncome - dataset.stats.totalExpenses).toLocaleString('es-AR')}`)
  return dataset
}

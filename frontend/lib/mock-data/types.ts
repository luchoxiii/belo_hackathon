import { z } from 'zod'

// ============================================
// CATEGORÍAS EXPANDIDAS PARA HISTORIAL
// ============================================

export const TRANSACTION_CATEGORIES = [
  // Ingresos
  'salario',
  'aguinaldo',
  'freelance',
  'alquiler_cobrado',
  'reembolso',
  'transferencia_recibida',
  'interes_plazo_fijo',
  'dividendos',
  'venta_crypto',

  // Gastos fijos
  'alquiler',
  'expensas',
  'luz',
  'gas',
  'agua',
  'internet',
  'telefono',
  'cable',
  'seguro_auto',
  'seguro_hogar',
  'patente',
  'vtv',

  // Impuestos
  'impuesto_ganancias',
  'impuesto_bienes_personales',
  'monotributo',
  'iibb',
  'abl',

  // Tarjeta de crédito
  'tarjeta_resumen',
  'tarjeta_supermercado',
  'tarjeta_farmacia',
  'tarjeta_indumentaria',
  'tarjeta_restaurante',
  'tarjeta_entretenimiento',
  'tarjeta_tecnologia',
  'tarjeta_viajes',
  'tarjeta_combustible',
  'tarjeta_otros',

  // Débitos automáticos
  'debito_netflix',
  'debito_spotify',
  'debito_gimnasio',
  'debito_obra_social',
  'debito_prepaga',
  'debito_colegio',
  'debito_universidad',
  'debito_streaming',

  // Educación (hija)
  'matricula_escolar',
  'cuota_colegio',
  'utiles_escolares',
  'uniforme_escolar',
  'actividad_extracurricular',

  // Crypto
  'compra_crypto',
  'venta_crypto',
  'staking_reward',
  'swap_crypto',

  // Inversiones
  'plazo_fijo_constitucion',
  'plazo_fijo_vencimiento',
  'compra_cedear',
  'venta_cedear',
  'compra_bono',
  'venta_bono',
  'fci_suscripcion',
  'fci_rescate',

  // Transferencias
  'transferencia_enviada',
  'transferencia_recibida',

  // Efectivo
  'extraccion_cajero',
  'deposito_efectivo',

  // Hogar y familia
  'supermercado',
  'farmacia',
  'pediatra',
  'medico',
  'veterinario',
  'mantenimiento_hogar',
  'electrodomesticos',

  // Transporte
  'combustible',
  'estacionamiento',
  'peaje',
  'mantenimiento_auto',
  'transporte_publico',
  'uber_taxi',

  // Otros
  'regalo',
  'donacion',
  'otros',
] as const

export const TRANSACTION_METHODS = [
  'transferencia',
  'tarjeta_debito',
  'tarjeta_credito',
  'efectivo',
  'debito_automatico',
  'crypto',
  'plazo_fijo',
  'inversion',
] as const

export const CRYPTO_ASSETS = [
  'BTC',
  'ETH',
  'USDT',
  'USDC',
  'SOL',
  'DAI',
] as const

// ============================================
// SCHEMAS ZOD
// ============================================

const isoDateTime = z.string().datetime()
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

// Transacción base (compatible con estructura Belo)
export const transactionSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['credit', 'debit']), // credit = ingreso, debit = gasto
  category: z.enum(TRANSACTION_CATEGORIES),
  amount: z.number().positive().finite(),
  currency: z.enum(['ARS', 'USD', 'BTC', 'ETH', 'USDT', 'USDC', 'SOL', 'DAI']),
  amountArs: z.number().finite(), // Siempre el equivalente en ARS al momento
  description: z.string().max(200),
  merchant: z.string().max(100).optional(), // Comercio/origen
  method: z.enum(TRANSACTION_METHODS),
  reference: z.string().max(50).optional(), // Número de referencia/comprobante
  createdAt: isoDateTime,

  // Metadata adicional
  tags: z.array(z.string()).optional(),
  relatedTransactionId: z.string().uuid().optional(), // Para vincular (ej: plazo fijo)

  // Datos de crypto (si aplica)
  crypto: z.object({
    asset: z.enum(CRYPTO_ASSETS),
    amount: z.number().positive(),
    priceArs: z.number().positive(), // Precio unitario al momento
    network: z.string().optional(),
    txHash: z.string().optional(),
  }).optional(),

  // Datos de inversión (si aplica)
  investment: z.object({
    type: z.enum(['plazo_fijo', 'cedear', 'bono', 'fci']),
    ticker: z.string().optional(),
    quantity: z.number().optional(),
    rate: z.number().optional(), // TNA para plazo fijo
    maturityDate: isoDate.optional(),
  }).optional(),

  // Datos de tarjeta (si aplica)
  card: z.object({
    last4: z.string().length(4),
    brand: z.enum(['visa', 'mastercard', 'amex']),
    installments: z.number().int().min(1).max(24).optional(),
    currentInstallment: z.number().int().min(1).optional(),
  }).optional(),
})

// Balance/Saldo
export const balanceSchema = z.object({
  currency: z.enum(['ARS', 'USD', 'BTC', 'ETH', 'USDT', 'USDC', 'SOL', 'DAI']),
  available: z.number().finite(),
  pending: z.number().finite().optional(),
  updatedAt: isoDateTime,
})

// Cuenta/Wallet
export const accountSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['checking', 'savings', 'crypto', 'investment']),
  name: z.string(),
  currency: z.enum(['ARS', 'USD', 'BTC', 'ETH', 'USDT', 'USDC', 'SOL', 'DAI']),
  balance: balanceSchema,
  cbu: z.string().length(22).optional(), // Para cuentas bancarias
  alias: z.string().optional(),
})

// Perfil del usuario mock
export const userProfileSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  familyMembers: z.array(z.object({
    name: z.string(),
    relationship: z.enum(['spouse', 'child', 'parent', 'sibling', 'other']),
    birthDate: isoDate.optional(),
  })),
  employment: z.object({
    type: z.enum(['empleado', 'autonomo', 'monotributista', 'jubilado']),
    company: z.string().optional(),
    position: z.string().optional(),
    monthlySalary: z.number().positive(),
    payDay: z.number().int().min(1).max(31),
  }),
  location: z.object({
    city: z.string(),
    province: z.string(),
  }),
})

// Dataset completo
export const mockDatasetSchema = z.object({
  version: z.string(),
  generatedAt: isoDateTime,
  profile: userProfileSchema,
  accounts: z.array(accountSchema),
  transactions: z.array(transactionSchema),

  // Metadata del dataset
  dateRange: z.object({
    from: isoDate,
    to: isoDate,
  }),
  stats: z.object({
    totalTransactions: z.number().int(),
    totalIncome: z.number(),
    totalExpenses: z.number(),
    averageMonthlyIncome: z.number(),
    averageMonthlyExpenses: z.number(),
  }),
})

// ============================================
// TIPOS TYPESCRIPT
// ============================================

export type TransactionCategory = (typeof TRANSACTION_CATEGORIES)[number]
export type TransactionMethod = (typeof TRANSACTION_METHODS)[number]
export type CryptoAsset = (typeof CRYPTO_ASSETS)[number]
export type Transaction = z.infer<typeof transactionSchema>
export type Balance = z.infer<typeof balanceSchema>
export type Account = z.infer<typeof accountSchema>
export type UserProfile = z.infer<typeof userProfileSchema>
export type MockDataset = z.infer<typeof mockDatasetSchema>

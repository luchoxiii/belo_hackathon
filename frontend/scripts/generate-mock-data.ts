#!/usr/bin/env npx tsx

/**
 * Script para generar datos mock de transacciones financieras
 *
 * Uso:
 *   npm run generate-mock-data
 *   npx tsx scripts/generate-mock-data.ts
 *
 * Salida:
 *   - data/mock-transactions.json (dataset completo)
 *   - data/mock-summary.json (resumen estadístico)
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { generateMockDataset, MockDataset, Transaction } from '../lib/mock-data'

const DATA_DIR = join(__dirname, '..', 'data')

// Asegurar que existe el directorio
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true })
}

console.log('🚀 Generando dataset mock de transacciones financieras...\n')

// Generar dataset de 2 años
const dataset = generateMockDataset(2)

// Guardar dataset completo
const datasetPath = join(DATA_DIR, 'mock-transactions.json')
writeFileSync(datasetPath, JSON.stringify(dataset, null, 2), 'utf-8')
console.log(`✅ Dataset guardado en: ${datasetPath}`)

// Crear resumen legible
const summary = createSummary(dataset)
const summaryPath = join(DATA_DIR, 'mock-summary.json')
writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf-8')
console.log(`✅ Resumen guardado en: ${summaryPath}`)

// Mostrar estadísticas
console.log('\n📊 ESTADÍSTICAS DEL DATASET')
console.log('═'.repeat(50))
console.log(`👤 Perfil: ${dataset.profile.name}`)
console.log(`👨‍👩‍👧 Familia: ${dataset.profile.familyMembers.map(m => m.name).join(', ')}`)
console.log(`💼 Empleo: ${dataset.profile.employment.position} en ${dataset.profile.employment.company}`)
console.log(`📍 Ubicación: ${dataset.profile.location.city}, ${dataset.profile.location.province}`)
console.log('')
console.log(`📅 Período: ${dataset.dateRange.from} a ${dataset.dateRange.to}`)
console.log(`📝 Total transacciones: ${dataset.stats.totalTransactions.toLocaleString('es-AR')}`)
console.log('')
console.log(`💰 Ingresos totales: $${dataset.stats.totalIncome.toLocaleString('es-AR')}`)
console.log(`💸 Gastos totales: $${dataset.stats.totalExpenses.toLocaleString('es-AR')}`)
console.log(`📈 Balance neto: $${(dataset.stats.totalIncome - dataset.stats.totalExpenses).toLocaleString('es-AR')}`)
console.log('')
console.log(`📊 Promedio mensual ingresos: $${dataset.stats.averageMonthlyIncome.toLocaleString('es-AR')}`)
console.log(`📊 Promedio mensual gastos: $${dataset.stats.averageMonthlyExpenses.toLocaleString('es-AR')}`)

// Mostrar desglose por categoría
console.log('\n📋 TOP 10 CATEGORÍAS DE GASTO')
console.log('─'.repeat(50))
const expensesByCategory = getExpensesByCategory(dataset.transactions)
const sortedCategories = Object.entries(expensesByCategory)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10)

for (const [category, amount] of sortedCategories) {
  const percentage = ((amount / dataset.stats.totalExpenses) * 100).toFixed(1)
  console.log(`  ${category.padEnd(30)} $${amount.toLocaleString('es-AR').padStart(15)} (${percentage}%)`)
}

// Mostrar transacciones crypto
console.log('\n🪙 RESUMEN CRYPTO')
console.log('─'.repeat(50))
const cryptoTxs = dataset.transactions.filter(t => t.crypto)
const cryptoByAsset = getCryptoByAsset(cryptoTxs)
for (const [asset, data] of Object.entries(cryptoByAsset)) {
  console.log(`  ${asset}: ${data.totalAmount.toFixed(asset === 'BTC' ? 8 : 2)} (${data.count} operaciones)`)
}

// Mostrar cuentas
console.log('\n🏦 CUENTAS')
console.log('─'.repeat(50))
for (const account of dataset.accounts) {
  console.log(`  ${account.name}: ${account.balance.available.toLocaleString('es-AR')} ${account.currency}`)
}

console.log('\n✨ Generación completada!')

// ============================================
// FUNCIONES AUXILIARES
// ============================================

function createSummary(dataset: MockDataset) {
  const expensesByCategory = getExpensesByCategory(dataset.transactions)
  const incomeByCategory = getIncomeByCategory(dataset.transactions)
  const monthlyBreakdown = getMonthlyBreakdown(dataset.transactions)

  return {
    profile: {
      name: dataset.profile.name,
      family: dataset.profile.familyMembers.map(m => ({
        name: m.name,
        relationship: m.relationship,
      })),
      employment: dataset.profile.employment,
      location: dataset.profile.location,
    },
    dateRange: dataset.dateRange,
    totals: {
      transactions: dataset.stats.totalTransactions,
      income: dataset.stats.totalIncome,
      expenses: dataset.stats.totalExpenses,
      net: dataset.stats.totalIncome - dataset.stats.totalExpenses,
    },
    averages: {
      monthlyIncome: dataset.stats.averageMonthlyIncome,
      monthlyExpenses: dataset.stats.averageMonthlyExpenses,
      monthlyNet: dataset.stats.averageMonthlyIncome - dataset.stats.averageMonthlyExpenses,
    },
    breakdown: {
      expensesByCategory,
      incomeByCategory,
      monthlyBreakdown,
    },
    accounts: dataset.accounts.map(a => ({
      name: a.name,
      type: a.type,
      currency: a.currency,
      balance: a.balance.available,
    })),
  }
}

function getExpensesByCategory(transactions: Transaction[]): Record<string, number> {
  const result: Record<string, number> = {}
  for (const tx of transactions) {
    if (tx.type === 'debit') {
      result[tx.category] = (result[tx.category] || 0) + tx.amountArs
    }
  }
  return result
}

function getIncomeByCategory(transactions: Transaction[]): Record<string, number> {
  const result: Record<string, number> = {}
  for (const tx of transactions) {
    if (tx.type === 'credit') {
      result[tx.category] = (result[tx.category] || 0) + tx.amountArs
    }
  }
  return result
}

function getMonthlyBreakdown(transactions: Transaction[]): Record<string, { income: number; expenses: number; net: number }> {
  const result: Record<string, { income: number; expenses: number; net: number }> = {}

  for (const tx of transactions) {
    const month = tx.createdAt.substring(0, 7) // yyyy-MM
    if (!result[month]) {
      result[month] = { income: 0, expenses: 0, net: 0 }
    }
    if (tx.type === 'credit') {
      result[month].income += tx.amountArs
    } else {
      result[month].expenses += tx.amountArs
    }
    result[month].net = result[month].income - result[month].expenses
  }

  return result
}

function getCryptoByAsset(transactions: Transaction[]): Record<string, { totalAmount: number; count: number }> {
  const result: Record<string, { totalAmount: number; count: number }> = {}

  for (const tx of transactions) {
    if (tx.crypto) {
      const asset = tx.crypto.asset
      if (!result[asset]) {
        result[asset] = { totalAmount: 0, count: 0 }
      }
      // Si es compra, suma; si es venta, resta
      const multiplier = tx.type === 'debit' ? 1 : -1
      result[asset].totalAmount += tx.crypto.amount * multiplier
      result[asset].count++
    }
  }

  return result
}

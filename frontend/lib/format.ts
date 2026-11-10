const currency = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
})

const compact = new Intl.NumberFormat('es-AR', {
  notation: 'compact',
  maximumFractionDigits: 1,
})

export function formatARS(value: number) {
  return currency.format(value)
}

export function formatCompactARS(value: number) {
  return `$${compact.format(value)}`
}

export function formatDate(date: Date) {
  return new Intl.DateTimeFormat('es-AR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
    .format(date)
    .replace(/\./g, '')
}

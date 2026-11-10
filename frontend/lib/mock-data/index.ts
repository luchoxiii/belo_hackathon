// Mock Data Generator for Belo Hackathon
// Generates realistic 2+ year transaction history for an Argentine family

export * from './types'
export * from './generator'
export * from './adapter'

// Re-export main function with convenient alias
export { generateMockDataset as generate } from './generator'


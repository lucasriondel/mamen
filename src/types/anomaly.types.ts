export type AnomalyType = 'high-amount' | 'new-merchant' | 'potential-duplicate'

export type AnomalyFlag = {
  type: AnomalyType
  reason: string
  detectedAt: string
  dismissed: boolean
  dismissedAt?: string
}

export type AnomalySettings = {
  multiplierThreshold: number
  absoluteThreshold: number | null
  minTransactionsForDetection: number
}

export type Rule = {
  id?: number
  merchantId: number
  pattern: string
  categoryOverride?: number
  matchCount: number
  createdAt: Date
}

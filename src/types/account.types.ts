export type AccountType = 'checking' | 'savings' | 'credit_card' | 'other'

export type Account = {
  id?: number
  name: string
  type: AccountType
  createdAt: Date
  updatedAt: Date
}

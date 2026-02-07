export type Transaction = {
  id?: number
  accountId: number
  date: Date
  amount: number
  rawMerchantString: string
  merchantId?: number
  categoryId?: number
  categoryOverride?: string
  isRefund?: boolean
  linkedRefundId?: number
  importedAt: Date
  importMonth: string
  importBatchId?: string
}

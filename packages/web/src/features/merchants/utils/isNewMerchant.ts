export const NEW_MERCHANT_THRESHOLD_DAYS = 30

export const isNewMerchant = (createdAt: Date): boolean => {
  const now = new Date()
  const diffMs = now.getTime() - new Date(createdAt).getTime()
  const diffDays = diffMs / (1000 * 60 * 60 * 24)
  return diffDays <= NEW_MERCHANT_THRESHOLD_DAYS
}

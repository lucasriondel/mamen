type FormatCurrencyOptions = {
  currency?: string
  locale?: string
}

export const formatCurrency = (
  amount: number,
  options: FormatCurrencyOptions = {}
): string => {
  const { currency = 'EUR', locale = 'de-DE' } = options

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

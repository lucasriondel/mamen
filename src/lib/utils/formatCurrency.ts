import type { CurrencySymbol } from '@/features/settings/types/preferences.types'

type FormatCurrencyOptions = {
  currency?: string
  locale?: string
}

const SYMBOL_TO_CURRENCY: Record<CurrencySymbol, string> = {
  '€': 'EUR',
  '$': 'USD',
  '£': 'GBP',
  '¥': 'JPY',
  '₹': 'INR',
  'kr': 'SEK',
  'CHF': 'CHF',
}

export const formatCurrency = (
  amount: number,
  options: FormatCurrencyOptions = {},
): string => {
  const { currency = 'EUR', locale = 'de-DE' } = options

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export const formatCurrencyWithSymbol = (
  amount: number,
  symbol: CurrencySymbol = '€',
): string => {
  const currency = SYMBOL_TO_CURRENCY[symbol]
  return formatCurrency(amount, { currency })
}

import type { DateFormatOption } from '@/features/settings/types/preferences.types'

export const formatDate = (date: Date): string => {
  const now = new Date()
  const isCurrentYear = date.getFullYear() === now.getFullYear()

  if (isCurrentYear) {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

const pad = (n: number): string => String(n).padStart(2, '0')

export const formatDateWithOption = (
  date: Date | string,
  format: DateFormatOption = 'DD/MM/YYYY',
): string => {
  const d = typeof date === 'string' ? new Date(date) : date
  const day = pad(d.getDate())
  const month = pad(d.getMonth() + 1)
  const year = String(d.getFullYear())

  switch (format) {
    case 'DD/MM/YYYY':
      return `${day}/${month}/${year}`
    case 'MM/DD/YYYY':
      return `${month}/${day}/${year}`
    case 'YYYY-MM-DD':
      return `${year}-${month}-${day}`
  }
}

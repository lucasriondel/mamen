import Papa from 'papaparse'

export type CSVPreviewResult = {
  headers: string[]
  rows: string[][]
  hasHeaders: boolean
}

export type ColumnMapping = {
  dateColumn: string
  amountColumn: string
  descriptionColumn: string
}

export type DateFormatOption =
  | 'auto'
  | 'DD/MM/YYYY'
  | 'MM/DD/YYYY'
  | 'YYYY-MM-DD'
  | 'DD-MM-YYYY'
  | 'MM-DD-YYYY'
  | 'DD.MM.YYYY'

const DATE_PATTERNS = [
  'date', 'transaction date', 'posted date', 'trans date',
  'posting date', 'value date', 'effective date', 'trans. date',
]

const AMOUNT_PATTERNS = [
  'amount', 'debit', 'credit', 'value', 'sum', 'transaction amount',
  'withdrawal', 'deposit', 'money out', 'money in',
]

const DESCRIPTION_PATTERNS = [
  'description', 'merchant', 'narrative', 'details', 'payee',
  'transaction description', 'name', 'particulars', 'reference',
]

export const parseCSVPreview = (file: File, maxRows = 10): Promise<CSVPreviewResult> => {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: false,
      skipEmptyLines: true,
      preview: maxRows + 1,
      complete: (results) => {
        const allRows = results.data as string[][]
        if (allRows.length === 0) {
          reject(new Error('This file appears to be empty'))
          return
        }

        const firstRow = allRows[0]
        const hasHeaders = detectHasHeaders(firstRow)

        if (hasHeaders) {
          resolve({
            headers: firstRow,
            rows: allRows.slice(1),
            hasHeaders: true,
          })
        } else {
          const headers = firstRow.map((_, i) => `Column ${i + 1}`)
          resolve({
            headers,
            rows: allRows.slice(0, maxRows),
            hasHeaders: false,
          })
        }
      },
      error: (error) => {
        reject(new Error(`Failed to parse CSV: ${error.message}`))
      },
    })
  })
}

export const parseFullCSV = (file: File, hasHeaders: boolean): Promise<string[][]> => {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: false,
      skipEmptyLines: true,
      complete: (results) => {
        const allRows = results.data as string[][]
        resolve(hasHeaders ? allRows.slice(1) : allRows)
      },
      error: (error) => {
        reject(new Error(`Failed to parse CSV: ${error.message}`))
      },
    })
  })
}

const detectHasHeaders = (firstRow: string[]): boolean => {
  const lowered = firstRow.map((cell) => cell.toLowerCase().trim())
  const allPatterns = [...DATE_PATTERNS, ...AMOUNT_PATTERNS, ...DESCRIPTION_PATTERNS]
  const matchCount = lowered.filter((cell) =>
    allPatterns.some((pattern) => cell === pattern || cell.includes(pattern)),
  ).length
  return matchCount >= 2
}

export const autoDetectColumns = (headers: string[]): Partial<ColumnMapping> => {
  const mapping: Partial<ColumnMapping> = {}
  const lowered = headers.map((h) => h.toLowerCase().trim())

  for (let i = 0; i < lowered.length; i++) {
    const header = lowered[i]
    if (!mapping.dateColumn && DATE_PATTERNS.some((p) => header === p || header.includes(p))) {
      mapping.dateColumn = headers[i]
    }
    if (!mapping.amountColumn && AMOUNT_PATTERNS.some((p) => header === p || header.includes(p))) {
      mapping.amountColumn = headers[i]
    }
    if (!mapping.descriptionColumn && DESCRIPTION_PATTERNS.some((p) => header === p || header.includes(p))) {
      mapping.descriptionColumn = headers[i]
    }
  }

  return mapping
}

export const detectDateFormat = (sampleDates: string[]): DateFormatOption => {
  const formats: { pattern: RegExp; format: DateFormatOption; parse: (s: string) => Date | null }[] = [
    {
      pattern: /^\d{4}-\d{2}-\d{2}$/,
      format: 'YYYY-MM-DD',
      parse: (s) => {
        const [y, m, d] = s.split('-').map(Number)
        const date = new Date(y, m - 1, d)
        return isValidDate(date, y, m, d) ? date : null
      },
    },
    {
      pattern: /^\d{2}\/\d{2}\/\d{4}$/,
      format: 'DD/MM/YYYY',
      parse: (s) => {
        const [d, m, y] = s.split('/').map(Number)
        const date = new Date(y, m - 1, d)
        return isValidDate(date, y, m, d) ? date : null
      },
    },
    {
      pattern: /^\d{2}-\d{2}-\d{4}$/,
      format: 'DD-MM-YYYY',
      parse: (s) => {
        const [d, m, y] = s.split('-').map(Number)
        const date = new Date(y, m - 1, d)
        return isValidDate(date, y, m, d) ? date : null
      },
    },
    {
      pattern: /^\d{2}\.\d{2}\.\d{4}$/,
      format: 'DD.MM.YYYY',
      parse: (s) => {
        const [d, m, y] = s.split('.').map(Number)
        const date = new Date(y, m - 1, d)
        return isValidDate(date, y, m, d) ? date : null
      },
    },
  ]

  for (const { pattern, format, parse } of formats) {
    const matching = sampleDates.filter((d) => pattern.test(d.trim()))
    if (matching.length === sampleDates.length) {
      const allValid = matching.every((d) => parse(d.trim()) !== null)
      if (allValid) return format
    }
  }

  return 'auto'
}

export const parseDate = (value: string, format: DateFormatOption): Date | null => {
  const trimmed = value.trim()
  if (!trimmed) return null

  switch (format) {
    case 'YYYY-MM-DD': {
      const [y, m, d] = trimmed.split('-').map(Number)
      const date = new Date(y, m - 1, d)
      return isValidDate(date, y, m, d) ? date : null
    }
    case 'DD/MM/YYYY': {
      const [d, m, y] = trimmed.split('/').map(Number)
      const date = new Date(y, m - 1, d)
      return isValidDate(date, y, m, d) ? date : null
    }
    case 'MM/DD/YYYY': {
      const [m, d, y] = trimmed.split('/').map(Number)
      const date = new Date(y, m - 1, d)
      return isValidDate(date, y, m, d) ? date : null
    }
    case 'DD-MM-YYYY': {
      const [d, m, y] = trimmed.split('-').map(Number)
      const date = new Date(y, m - 1, d)
      return isValidDate(date, y, m, d) ? date : null
    }
    case 'MM-DD-YYYY': {
      const [m, d, y] = trimmed.split('-').map(Number)
      const date = new Date(y, m - 1, d)
      return isValidDate(date, y, m, d) ? date : null
    }
    case 'DD.MM.YYYY': {
      const [d, m, y] = trimmed.split('.').map(Number)
      const date = new Date(y, m - 1, d)
      return isValidDate(date, y, m, d) ? date : null
    }
    case 'auto': {
      // Try ISO first
      const isoDate = parseDate(trimmed, 'YYYY-MM-DD')
      if (isoDate) return isoDate
      // Try DD/MM/YYYY
      const ddMM = parseDate(trimmed, 'DD/MM/YYYY')
      if (ddMM) return ddMM
      // Try DD-MM-YYYY
      const ddMMDash = parseDate(trimmed, 'DD-MM-YYYY')
      if (ddMMDash) return ddMMDash
      // Try DD.MM.YYYY
      const ddMMDot = parseDate(trimmed, 'DD.MM.YYYY')
      if (ddMMDot) return ddMMDot
      // Fallback: JS Date constructor
      const fallback = new Date(trimmed)
      return isNaN(fallback.getTime()) ? null : fallback
    }
  }
}

export const parseAmount = (value: string): number | null => {
  if (!value || !value.trim()) return null

  let cleaned = value.trim().replace(/[€$£¥\s]/g, '')

  // Handle parentheses for negative: (50.00) -> -50.00
  if (cleaned.startsWith('(') && cleaned.endsWith(')')) {
    cleaned = '-' + cleaned.slice(1, -1)
  }

  // Detect European format: 1.234,56 (dot as thousands, comma as decimal)
  const hasCommaDecimal = /\d,\d{2}$/.test(cleaned)
  const hasPeriodDecimal = /\d\.\d{2}$/.test(cleaned)

  if (hasCommaDecimal && !hasPeriodDecimal) {
    // European: remove dots (thousands), replace comma with dot (decimal)
    cleaned = cleaned.replace(/\./g, '').replace(',', '.')
  } else if (!hasCommaDecimal && hasPeriodDecimal) {
    // US/UK: remove commas (thousands)
    cleaned = cleaned.replace(/,/g, '')
  } else {
    // Ambiguous or no decimal: remove commas
    cleaned = cleaned.replace(/,/g, '')
  }

  const amount = parseFloat(cleaned)
  return isNaN(amount) ? null : amount
}

const isValidDate = (date: Date, year: number, month: number, day: number): boolean => {
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  )
}

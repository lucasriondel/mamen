export const cleanMerchantString = (raw: string): string => {
  const cleaned = raw
    .replace(/\*[A-Z0-9]{6,}$/i, '') // AMZN*1234XYZ → AMZN
    .replace(/\s+\d{4,}$/i, '') // UBER TRIP 5678 → UBER TRIP
    .replace(/\s+#\d+$/i, '') // STORE #123 → STORE
    .trim()

  const result = cleaned.length === 0 ? raw.trim() : cleaned

  return result
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export const escapeRegex = (str: string): string => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export const extractPrefix = (str: string): string | null => {
  // Try multi-word prefix first (e.g., "Uber Trip"), then single word with optional asterisk
  const match = str.match(/^([A-Za-z]+\s+[A-Za-z]+|[A-Za-z]+\*?)/)
  return match ? match[1] : null
}

export const validateRegexPattern = (
  pattern: string,
): { valid: boolean; error?: string } => {
  if (pattern.length === 0) {
    return { valid: false, error: 'Pattern is required' }
  }
  try {
    new RegExp(pattern, 'i')
    return { valid: true }
  } catch (e) {
    return { valid: false, error: (e as Error).message }
  }
}

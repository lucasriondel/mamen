const BASE_URL = '/api'

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

const dateReviver = (_key: string, value: unknown): unknown => {
  if (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)
  ) {
    const date = new Date(value)
    if (!Number.isNaN(date.getTime())) return date
  }
  return value
}

const parseJsonWithDates = async <T>(response: Response): Promise<T> => {
  const text = await response.text()
  if (!text) return undefined as T
  return JSON.parse(text, dateReviver) as T
}

const request = async <T>(
  path: string,
  options: RequestInit = {},
): Promise<T> => {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    let message = `HTTP ${response.status}`
    try {
      const parsed = JSON.parse(body)
      if (parsed.error) message = parsed.error
    } catch {
      if (body) message = body
    }
    throw new ApiError(response.status, message)
  }

  return parseJsonWithDates<T>(response)
}

export const api = {
  get: <T>(path: string) => request<T>(path),

  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),

  put: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'PUT',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),

  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}

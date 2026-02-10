const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/

const dateReviver = (_key: string, value: unknown): unknown => {
  if (typeof value === 'string' && ISO_DATE_RE.test(value)) {
    return new Date(value)
  }
  return value
}

export const parseBody = async <T>(req: Request): Promise<T> => {
  const text = await req.text()
  return JSON.parse(text, dateReviver) as T
}

export const parseId = (raw: string | undefined): number | undefined => {
  if (!raw) return undefined
  const n = Number(raw)
  return Number.isNaN(n) ? undefined : n
}

export const jsonResponse = (data: unknown, status = 200): Response =>
  Response.json(data, { status })

export const errorResponse = (message: string, status: number): Response =>
  Response.json({ error: message }, { status })

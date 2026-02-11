import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/

const dateReviver = (_key: string, value: unknown): unknown => {
  if (typeof value === 'string' && ISO_DATE_RE.test(value)) {
    return new Date(value)
  }
  return value
}

const dateParserPlugin = async (fastify: FastifyInstance) => {
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_req, body, done) => {
      try {
        const parsed = JSON.parse(body as string, dateReviver)
        done(null, parsed)
      } catch (err) {
        done(err as Error, undefined)
      }
    },
  )
}

export default fp(dateParserPlugin, { name: 'date-parser' })

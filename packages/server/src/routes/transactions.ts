import type { FastifyInstance } from 'fastify'
import type { Transaction } from '@mamen/shared'

export default async function transactionRoutes(fastify: FastifyInstance) {
  fastify.get<{
    Querystring: {
      accountId?: string
      importMonth?: string
      merchantId?: string
      categoryId?: string
      importBatchId?: string
      linkedRefundId?: string
      startDate?: string
      endDate?: string
      orderBy?: string
      direction?: 'asc' | 'desc'
    }
  }>('/transactions', async (request) => {
    const { accountId, importMonth, merchantId, categoryId, importBatchId, linkedRefundId, startDate, endDate, orderBy, direction } = request.query

    if (accountId && importMonth) {
      return fastify.db.transactions.getByAccountIdAndMonth(Number(accountId), importMonth)
    }
    if (accountId) {
      return fastify.db.transactions.getByAccountId(Number(accountId))
    }
    if (merchantId) {
      return fastify.db.transactions.getByMerchantId(Number(merchantId))
    }
    if (categoryId) {
      return fastify.db.transactions.getByCategoryId(Number(categoryId))
    }
    if (importBatchId) {
      return fastify.db.transactions.getByImportBatchId(importBatchId)
    }
    if (linkedRefundId) {
      return fastify.db.transactions.getByLinkedRefundId(Number(linkedRefundId))
    }
    if (startDate && endDate) {
      return fastify.db.transactions.getByDateRange(new Date(startDate), new Date(endDate))
    }
    if (orderBy === 'date') {
      return fastify.db.transactions.getAllOrderedByDate(direction ?? undefined)
    }

    return fastify.db.transactions.getAll()
  })

  fastify.get<{
    Querystring: { accountId?: string; importMonth?: string; importBatchId?: string }
  }>('/transactions/count', async (request) => {
    const { accountId, importMonth, importBatchId } = request.query

    if (accountId && importMonth) {
      return { count: await fastify.db.transactions.countByAccountIdAndMonth(Number(accountId), importMonth) }
    }
    if (importBatchId) {
      return { count: await fastify.db.transactions.countByImportBatchId(importBatchId) }
    }
    return { count: await fastify.db.transactions.count() }
  })

  fastify.get<{ Params: { id: string } }>('/transactions/:id', async (request, reply) => {
    const id = Number(request.params.id)
    if (Number.isNaN(id)) return reply.status(400).send({ error: 'Invalid id' })

    const tx = await fastify.db.transactions.get(id)
    if (!tx) return reply.status(404).send({ error: 'Not found' })
    return tx
  })

  fastify.post<{ Body: Omit<Transaction, 'id'> }>('/transactions', async (request, reply) => {
    const id = await fastify.db.transactions.add(request.body)
    return reply.status(201).send({ id })
  })

  fastify.post<{ Body: { records: Omit<Transaction, 'id'>[] } }>('/transactions/bulk', async (request, reply) => {
    const ids = await fastify.db.transactions.bulkAddReturningIds(request.body.records)
    return reply.status(201).send({ ids })
  })

  fastify.put<{ Params: { id: string }; Body: Partial<Transaction> }>('/transactions/:id', async (request, reply) => {
    const id = Number(request.params.id)
    if (Number.isNaN(id)) return reply.status(400).send({ error: 'Invalid id' })

    await fastify.db.transactions.update(id, request.body)
    return { ok: true }
  })

  fastify.put<{ Body: { records: Transaction[] } }>('/transactions/bulk-put', async (request) => {
    await fastify.db.transactions.bulkPut(request.body.records)
    return { ok: true }
  })

  fastify.delete<{ Params: { id: string } }>('/transactions/:id', async (request, reply) => {
    const id = Number(request.params.id)
    if (Number.isNaN(id)) return reply.status(400).send({ error: 'Invalid id' })

    await fastify.db.transactions.delete(id)
    return { ok: true }
  })

  fastify.post<{ Body: { ids: number[] } }>('/transactions/bulk-delete', async (request) => {
    await fastify.db.transactions.bulkDelete(request.body.ids)
    return { ok: true }
  })

  fastify.post<{ Body: { ids: number[] } }>('/transactions/bulk-get', async (request) => {
    return fastify.db.transactions.bulkGet(request.body.ids)
  })

  fastify.delete<{
    Querystring: { accountId?: string; importMonth?: string }
  }>('/transactions/by-account-month', async (request, reply) => {
    const { accountId, importMonth } = request.query
    if (!accountId || !importMonth) return reply.status(400).send({ error: 'accountId and importMonth required' })

    await fastify.db.transactions.deleteByAccountIdAndMonth(Number(accountId), importMonth)
    return { ok: true }
  })

  fastify.delete<{ Params: { batchId: string } }>('/transactions/by-import-batch/:batchId', async (request) => {
    await fastify.db.transactions.deleteByImportBatchId(request.params.batchId)
    return { ok: true }
  })
}

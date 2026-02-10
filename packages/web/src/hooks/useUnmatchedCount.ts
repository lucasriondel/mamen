import { db, useLiveQuery } from '@/lib/db'

type UseUnmatchedCountReturn = {
  count: number
  isLoading: boolean
}

export const useUnmatchedCount = (): UseUnmatchedCountReturn => {
  const count = useLiveQuery(
    () => db.transactions.filter((t) => t.merchantId === undefined).count(),
    [],
  )

  return {
    count: count ?? 0,
    isLoading: count === undefined,
  }
}

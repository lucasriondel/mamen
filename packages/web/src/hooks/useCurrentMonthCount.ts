import { useFocusMode } from '@/context/FocusModeContext'
import { useQuery } from '@tanstack/react-query'
import { transactionsApi, queryKeys } from '@/lib/api'

export const useCurrentMonthCount = (): number => {
  const { currentMonthRange } = useFocusMode()

  const { data: count = 0 } = useQuery({
    queryKey: queryKeys.transactions.count({ startDate: currentMonthRange.start.toISOString(), endDate: currentMonthRange.end.toISOString() }),
    queryFn: () =>
      transactionsApi.getAll({
        startDate: currentMonthRange.start.toISOString(),
        endDate: currentMonthRange.end.toISOString(),
      }).then((txs) => txs.length),
  })

  return count
}

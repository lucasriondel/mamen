import { useFocusMode } from '@/context/FocusModeContext'
import { useApiQuery, transactionsApi } from '@/lib/api'

export const useCurrentMonthCount = (): number => {
  const { currentMonthRange } = useFocusMode()

  const count = useApiQuery(
    () =>
      transactionsApi.getAll({
        startDate: currentMonthRange.start.toISOString(),
        endDate: currentMonthRange.end.toISOString(),
      }).then((txs) => txs.length),
    ['transactions'],
  )

  return count ?? 0
}

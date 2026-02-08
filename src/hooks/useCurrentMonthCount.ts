import { db, useLiveQuery } from '@/lib/db'
import { useFocusMode } from '@/context/FocusModeContext'

export const useCurrentMonthCount = (): number => {
  const { currentMonthRange } = useFocusMode()

  const startTime = currentMonthRange.start.getTime()
  const endTime = currentMonthRange.end.getTime()

  const count = useLiveQuery(
    () =>
      db.transactions
        .where('date')
        .between(currentMonthRange.start, currentMonthRange.end, true, true)
        .count(),
    [startTime, endTime],
  )

  return count ?? 0
}

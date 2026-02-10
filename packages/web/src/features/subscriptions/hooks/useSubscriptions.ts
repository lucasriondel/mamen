import { useMemo } from 'react'
import { useApiQuery, subscriptionsApi } from '@/lib/api'
import type { Subscription } from '@/types'

export type UseSubscriptionsReturn = {
  subscriptions: Subscription[]
  active: Subscription[]
  possiblyCancelled: Subscription[]
  monthlyTotal: number
  yearlyTotal: number
  count: number
  isLoading: boolean
}

export const useSubscriptions = (): UseSubscriptionsReturn => {
  const subscriptions = useApiQuery(
    () => subscriptionsApi.getAll(),
    ['subscriptions'],
  )

  return useMemo(() => {
    if (subscriptions === undefined) {
      return {
        subscriptions: [],
        active: [],
        possiblyCancelled: [],
        monthlyTotal: 0,
        yearlyTotal: 0,
        count: 0,
        isLoading: true,
      }
    }

    const active = subscriptions.filter(s => s.status === 'active')
    const possiblyCancelled = subscriptions.filter(s => s.status === 'possibly-cancelled')

    const monthlyTotal = active
      .filter(s => s.frequency === 'monthly')
      .reduce((sum, s) => sum + Math.abs(s.typicalAmount), 0)

    const yearlyTotal = active.reduce((sum, s) => {
      switch (s.frequency) {
        case 'monthly': return sum + Math.abs(s.typicalAmount) * 12
        case 'yearly': return sum + Math.abs(s.typicalAmount)
        case 'weekly': return sum + Math.abs(s.typicalAmount) * 52
      }
    }, 0)

    return {
      subscriptions,
      active,
      possiblyCancelled,
      monthlyTotal,
      yearlyTotal,
      count: active.length,
      isLoading: false,
    }
  }, [subscriptions])
}

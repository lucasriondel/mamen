import { queryClient } from './queryClient'
import { queryKeys } from './queryKeys'

const composedQueryPrefixes = [
  'merchantDetail',
  'merchantsList',
  'merchantSearchSelect',
  'existingMerchant',
  'rulesListByMerchant',
  'dataManagementCounts',
  'categoryTooltip',
] as const

export const invalidateEntity = (...entities: (keyof typeof queryKeys)[]) => {
  for (const entity of entities) {
    queryClient.invalidateQueries({ queryKey: queryKeys[entity].all })
  }
  for (const prefix of composedQueryPrefixes) {
    queryClient.invalidateQueries({ queryKey: [prefix] })
  }
}

export const invalidateAll = () => {
  queryClient.invalidateQueries()
}

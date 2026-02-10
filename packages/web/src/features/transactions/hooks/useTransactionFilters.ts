import { useCallback, useMemo, useState } from 'react'
import type { ColumnFiltersState } from '@tanstack/react-table'

export type TransactionFilterValues = {
  description?: string
  amountMode?: 'range' | 'precise'
  amountMin?: number
  amountMax?: number
  amountPrecise?: number
  categoryId?: number
  subcategoryId?: number
  dateMode?: 'exact' | 'range' | 'month'
  dateExact?: Date
  dateStart?: Date
  dateEnd?: Date
  monthYear?: { month: number; year: number }
  accountIds?: number[]
}

type FilterGroup = 'description' | 'amount' | 'category' | 'date' | 'account'

export function useTransactionFilters() {
  const [filterValues, setFilterValues] = useState<TransactionFilterValues>({})

  const columnFilters = useMemo<ColumnFiltersState>(() => {
    const filters: ColumnFiltersState = []

    // Description filter
    if (filterValues.description) {
      filters.push({ id: 'rawMerchantString', value: filterValues.description })
    }

    // Amount filter
    if (filterValues.amountMode === 'precise' && filterValues.amountPrecise != null) {
      filters.push({ id: 'amount', value: filterValues.amountPrecise })
    } else if (filterValues.amountMode === 'range') {
      const hasMin = filterValues.amountMin != null
      const hasMax = filterValues.amountMax != null
      if (hasMin || hasMax) {
        filters.push({
          id: 'amount',
          value: { min: filterValues.amountMin, max: filterValues.amountMax },
        })
      }
    }

    // Category filter
    if (filterValues.categoryId != null) {
      filters.push({ id: 'category', value: filterValues.categoryId })
    }

    // Date filter
    if (filterValues.dateMode === 'exact' && filterValues.dateExact) {
      filters.push({ id: 'date', value: filterValues.dateExact })
    } else if (filterValues.dateMode === 'range') {
      const hasStart = filterValues.dateStart != null
      const hasEnd = filterValues.dateEnd != null
      if (hasStart || hasEnd) {
        filters.push({
          id: 'date',
          value: { start: filterValues.dateStart, end: filterValues.dateEnd },
        })
      }
    } else if (filterValues.dateMode === 'month' && filterValues.monthYear) {
      filters.push({ id: 'date', value: filterValues.monthYear })
    }

    // Account filter
    if (filterValues.accountIds && filterValues.accountIds.length > 0) {
      filters.push({ id: 'accountId', value: filterValues.accountIds })
    }

    return filters
  }, [filterValues])

  const setDescription = useCallback((value: string | undefined) => {
    setFilterValues((prev) => ({ ...prev, description: value }))
  }, [])

  const setAmountRange = useCallback((min?: number, max?: number) => {
    setFilterValues((prev) => ({
      ...prev,
      amountMode: 'range',
      amountMin: min,
      amountMax: max,
      amountPrecise: undefined,
    }))
  }, [])

  const setAmountPrecise = useCallback((value: number | undefined) => {
    setFilterValues((prev) => ({
      ...prev,
      amountMode: value != null ? 'precise' : undefined,
      amountPrecise: value,
      amountMin: undefined,
      amountMax: undefined,
    }))
  }, [])

  const setCategory = useCallback((categoryId?: number, subcategoryId?: number) => {
    setFilterValues((prev) => ({ ...prev, categoryId, subcategoryId }))
  }, [])

  const setDateExact = useCallback((date: Date | undefined) => {
    setFilterValues((prev) => ({
      ...prev,
      dateMode: date ? 'exact' : undefined,
      dateExact: date,
      dateStart: undefined,
      dateEnd: undefined,
      monthYear: undefined,
    }))
  }, [])

  const setDateRange = useCallback((start?: Date, end?: Date) => {
    setFilterValues((prev) => ({
      ...prev,
      dateMode: 'range',
      dateStart: start,
      dateEnd: end,
      dateExact: undefined,
      monthYear: undefined,
    }))
  }, [])

  const setMonthYear = useCallback((monthYear: { month: number; year: number } | undefined) => {
    setFilterValues((prev) => ({
      ...prev,
      dateMode: monthYear ? 'month' : undefined,
      monthYear,
      dateExact: undefined,
      dateStart: undefined,
      dateEnd: undefined,
    }))
  }, [])

  const setAccountIds = useCallback((accountIds: number[] | undefined) => {
    setFilterValues((prev) => ({ ...prev, accountIds }))
  }, [])

  const clearFilter = useCallback((group: FilterGroup) => {
    setFilterValues((prev) => {
      const next = { ...prev }
      switch (group) {
        case 'description':
          next.description = undefined
          break
        case 'amount':
          next.amountMode = undefined
          next.amountMin = undefined
          next.amountMax = undefined
          next.amountPrecise = undefined
          break
        case 'category':
          next.categoryId = undefined
          next.subcategoryId = undefined
          break
        case 'date':
          next.dateMode = undefined
          next.dateExact = undefined
          next.dateStart = undefined
          next.dateEnd = undefined
          next.monthYear = undefined
          break
        case 'account':
          next.accountIds = undefined
          break
      }
      return next
    })
  }, [])

  const clearAllFilters = useCallback(() => {
    setFilterValues({})
  }, [])

  const activeFilterCount = useMemo(() => columnFilters.length, [columnFilters])

  const hasActiveFilters = activeFilterCount > 0

  return {
    filterValues,
    columnFilters,
    setDescription,
    setAmountRange,
    setAmountPrecise,
    setCategory,
    setDateExact,
    setDateRange,
    setMonthYear,
    setAccountIds,
    clearFilter,
    clearAllFilters,
    activeFilterCount,
    hasActiveFilters,
  }
}

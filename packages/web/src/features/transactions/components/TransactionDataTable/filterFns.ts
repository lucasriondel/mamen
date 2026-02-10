import type { Row } from '@tanstack/react-table'
import type { Transaction } from '@/types'

/**
 * Amount filter — supports two modes:
 * - Precise: filterValue is a number → exact match on Math.abs(amount)
 * - Range: filterValue is { min?: number, max?: number } → range comparison on Math.abs(amount)
 */
export function amountFilterFn(
  row: Row<Transaction>,
  _columnId: string,
  filterValue: number | { min?: number; max?: number },
): boolean {
  const absAmount = Math.abs(row.original.amount)

  if (typeof filterValue === 'number') {
    return absAmount === filterValue
  }

  const { min, max } = filterValue
  if (min != null && absAmount < min) return false
  if (max != null && absAmount > max) return false
  return true
}
amountFilterFn.autoRemove = (val: unknown) => val == null

/**
 * Date filter — supports three modes:
 * - Exact: filterValue is a Date → match on same calendar day
 * - Range: filterValue is { start?: Date, end?: Date } → date within range
 * - Month/Year: filterValue is { month: number, year: number } → match month+year
 */
export function dateFilterFn(
  row: Row<Transaction>,
  _columnId: string,
  filterValue: Date | { start?: Date; end?: Date } | { month: number; year: number },
): boolean {
  const date = row.original.date

  if (filterValue instanceof Date) {
    return (
      date.getFullYear() === filterValue.getFullYear() &&
      date.getMonth() === filterValue.getMonth() &&
      date.getDate() === filterValue.getDate()
    )
  }

  if ('month' in filterValue && 'year' in filterValue) {
    return (
      date.getMonth() === filterValue.month &&
      date.getFullYear() === filterValue.year
    )
  }

  const { start, end } = filterValue as { start?: Date; end?: Date }
  if (start != null && date < start) return false
  if (end != null && date > end) return false
  return true
}
dateFilterFn.autoRemove = (val: unknown) => val == null

/**
 * Category filter — matches row.original.categoryId (or subcategoryId if provided).
 * filterValue is a number representing categoryId.
 */
export function categoryFilterFn(
  row: Row<Transaction>,
  _columnId: string,
  filterValue: number,
): boolean {
  const tx = row.original
  return tx.categoryId === filterValue || tx.subcategoryId === filterValue
}
categoryFilterFn.autoRemove = (val: unknown) => val == null

/**
 * Description filter — case-insensitive includes on rawMerchantString.
 */
export function descriptionFilterFn(
  row: Row<Transaction>,
  _columnId: string,
  filterValue: string,
): boolean {
  if (!filterValue) return true
  return row.original.rawMerchantString
    .toLowerCase()
    .includes(filterValue.toLowerCase())
}
descriptionFilterFn.autoRemove = (val: unknown) => !val

/**
 * Accounts filter — checks accountId is in number[].
 */
export function accountsFilterFn(
  row: Row<Transaction>,
  _columnId: string,
  filterValue: number[],
): boolean {
  if (!filterValue || filterValue.length === 0) return true
  return filterValue.includes(row.original.accountId)
}
accountsFilterFn.autoRemove = (val: unknown) =>
  !val || (Array.isArray(val) && val.length === 0)

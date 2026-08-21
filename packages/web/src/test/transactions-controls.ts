import { screen } from "@testing-library/react";

/**
 * How long to wait for a control that only exists once the transactions table
 * has rows.
 *
 * `TransactionsSection` holds a skeleton until *two* reads settle — the list
 * itself, and the issuer lookup keyed on the ids that list returns — and the
 * sort header and the pager render with the rows, not before them. Testing
 * Library's default `findBy` window is one second, which a machine running the
 * whole suite in parallel can lose to scheduling alone: the control is missing
 * not because the page is wrong but because nothing has had a turn yet.
 *
 * Aligned with the runner's own per-test timeout, so a genuinely absent control
 * still fails the test rather than hanging it.
 */
const ROWS_TIMEOUT = 5000;

/**
 * The date sort header, once the table it heads is on screen — what a test
 * clicks to flip the order.
 */
export function findSortButton(): Promise<HTMLElement> {
  return screen.findByRole("button", { name: /sort by date/i }, { timeout: ROWS_TIMEOUT });
}

/**
 * The pager's **Next**, once the rows it pages through are on screen.
 *
 * The same controls render above and below the table, but the top copy is
 * `aria-hidden` (it would otherwise duplicate both buttons for a screen
 * reader), so this resolves to the one copy the accessibility tree exposes.
 */
export function findNextPageButton(): Promise<HTMLElement> {
  return screen.findByRole("button", { name: /next/i }, { timeout: ROWS_TIMEOUT });
}

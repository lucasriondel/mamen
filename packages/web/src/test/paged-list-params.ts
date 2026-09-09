import type { Mock } from "vitest";

/**
 * The params of the **paged** list call — the rows on screen — out of a mocked
 * `transactionQueries.list`.
 *
 * `TransactionsSection` fires two list queries per render: the paged one behind
 * the table, and a wide month-scan (`limit: 1000`, the page's scope but none of
 * the user's filters) that mints the month picker's options. Only the paged call
 * asks for an order, so `orderBy` is what tells the two apart — and reading the
 * *last* call off the mock is a coin flip between them.
 *
 * Every page that lists transactions had to make that distinction in its own
 * harness; this is the one they share, so a change to how the section queries
 * lands in one place rather than in each view's test file.
 *
 * Throws rather than returning `undefined` when no paged call was made: the
 * caller is about to assert on the params, and a missing query is a different
 * failure from a wrong one.
 */
export function pagedListParams(listMock: Mock): Record<string, unknown> {
  const call = listMock.mock.calls
    .map(([params]) => params as Record<string, unknown>)
    .findLast((params) => params.orderBy === "date");
  if (call === undefined) throw new Error("no paged list call was made");
  return call;
}

import { Schema } from "effect";

/**
 * The server-side pagination defaults, applied when a raw caller omits the query
 * params. Exported so the typed SDK client (which must always send both, since
 * the decoded param type is required) fills the same window — one source of
 * truth for the default page size.
 */
export const PaginationDefaults = { limit: 50, offset: 0 } as const;

/**
 * Shared list-pagination query params. Spread into every list endpoint's
 * `urlParams` struct alongside the resource's filters. Both are
 * `NumberFromString` (query strings) with defaults; `total` in the paged
 * envelope is the full filtered count before limit/offset is applied.
 */
export const Pagination = {
  limit: Schema.optionalWith(Schema.NumberFromString, {
    default: () => PaginationDefaults.limit,
  }),
  offset: Schema.optionalWith(Schema.NumberFromString, {
    default: () => PaginationDefaults.offset,
  }),
} as const;

/**
 * Generic paged list envelope: `{ items, total }`. Every list endpoint's
 * success schema is `Paged(Resource)`. `total` is the count of the full
 * filtered set (so the client can page); `items` is the current page.
 */
export const Paged = <A, I, R>(item: Schema.Schema<A, I, R>) =>
  Schema.Struct({
    items: Schema.Array(item),
    total: Schema.Number,
  });

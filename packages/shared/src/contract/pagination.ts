import { Schema } from "effect";

/**
 * Shared list-pagination query params. Spread into every list endpoint's
 * `urlParams` struct alongside the resource's filters. Both are
 * `NumberFromString` (query strings) with defaults; `total` in the paged
 * envelope is the full filtered count before limit/offset is applied.
 */
export const Pagination = {
	limit: Schema.optionalWith(Schema.NumberFromString, { default: () => 50 }),
	offset: Schema.optionalWith(Schema.NumberFromString, { default: () => 0 }),
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

import { SqlClient, SqlSchema } from "@effect/sql";
import type { Fragment } from "@effect/sql/Statement";
import {
	type MerchantId,
	NotFound,
	Paged,
	Subscription,
	type SubscriptionCreate,
	SubscriptionFrequency,
	SubscriptionId,
	SubscriptionStatus,
	type SubscriptionUpdate,
	TransactionId,
} from "@mamen/shared/contract";
import { Effect, Option, Schema } from "effect";
import { orDieSql } from "../db/errors";

/**
 * A stored subscription row. Dates are ISO-8601 TEXT columns that stay strings
 * (faithful port — not upgraded to `Date`); `transactionIds` is a JSON TEXT array
 * (NOT NULL, defaulting to `'[]'`). {@link SubscriptionFromRow} folds the JSON
 * blob into the `TransactionId` array so handlers only ever see the wire entity.
 */
const SubscriptionRow = Schema.Struct({
	id: Schema.Number,
	merchantId: Schema.Number,
	merchantName: Schema.String,
	typicalAmount: Schema.Number,
	frequency: SubscriptionFrequency,
	intervalDays: Schema.Number,
	lastChargeDate: Schema.String,
	firstChargeDate: Schema.String,
	chargeCount: Schema.Number,
	status: SubscriptionStatus,
	transactionIds: Schema.String,
	detectedAt: Schema.String,
	updatedAt: Schema.String,
});

/**
 * The JSON-array codec used inside the `transactionIds` TEXT column. Its *encoded*
 * side is a plain `number[]` — matching both `Subscription`'s encoded
 * `transactionIds` (the transform target) and the read-path decode below.
 */
const TransactionIdsJson = Schema.parseJson(Schema.Array(TransactionId));

/**
 * `Schema.transform` maps `SubscriptionRow`'s decoded type to `Subscription`'s
 * *encoded* shape (plain-number ids, JSON-string `transactionIds`, string
 * `frequency`/`status`); `Subscription`'s own schema then decodes that into the
 * class (validating the `frequency`/`status` literals and branding the ids). The
 * JSON parse/stringify of `transactionIds` lives here, so reads yield the entity.
 *
 * Exported for the round-trip test: reads decode through it (via `SqlSchema`),
 * and the storage inverse (`encode`) is verified directly rather than left dead,
 * since the write path builds its row with the hand-written `toWriteFields` below.
 */
export const SubscriptionFromRow = Schema.transform(
	SubscriptionRow,
	Subscription,
	{
		strict: true,
		decode: (row) => ({
			id: row.id,
			merchantId: row.merchantId,
			merchantName: row.merchantName,
			typicalAmount: row.typicalAmount,
			frequency: row.frequency,
			intervalDays: row.intervalDays,
			lastChargeDate: row.lastChargeDate,
			firstChargeDate: row.firstChargeDate,
			chargeCount: row.chargeCount,
			status: row.status,
			transactionIds: Schema.decodeSync(TransactionIdsJson)(row.transactionIds),
			detectedAt: row.detectedAt,
			updatedAt: row.updatedAt,
		}),
		encode: (s) => ({
			id: s.id,
			merchantId: s.merchantId,
			merchantName: s.merchantName,
			typicalAmount: s.typicalAmount,
			frequency: s.frequency,
			intervalDays: s.intervalDays,
			lastChargeDate: s.lastChargeDate,
			firstChargeDate: s.firstChargeDate,
			chargeCount: s.chargeCount,
			status: s.status,
			// `s` is the entity's *encoded* shape, so `transactionIds` is already a
			// plain `number[]` — JSON-stringify it directly (the codec's encode wants
			// the branded Type side).
			transactionIds: JSON.stringify(s.transactionIds),
			detectedAt: s.detectedAt,
			updatedAt: s.updatedAt,
		}),
	},
);

const PagedSubscription = Paged(Subscription);

/** Number of rows in a `count(*)` result (used for the `list` total). */
const CountResult = Schema.Struct({ count: Schema.Number });

/** The `list` filter, decoded from the query string (both optional, composable). */
type ListFilter = {
	limit: number;
	offset: number;
	merchantId?: typeof MerchantId.Type;
	status?: SubscriptionStatus;
};

/** The composable filter set alone (shared by `list`'s items + total counts). */
type Filters = {
	merchantId?: typeof MerchantId.Type;
	status?: SubscriptionStatus;
};

/** A plain write row (the shape bound into INSERT/UPDATE), `transactionIds` as JSON. */
type WriteRow = {
	merchantId: number;
	merchantName: string;
	typicalAmount: number;
	frequency: string;
	intervalDays: number;
	lastChargeDate: string;
	firstChargeDate: string;
	chargeCount: number;
	status: string;
	transactionIds: string;
	detectedAt: string;
	updatedAt: string;
};

/**
 * The subscriptions repository, on `@effect/sql`. Depends only on the generic
 * `SqlClient.SqlClient` tag, so it runs unchanged against the Bun prod client and
 * the `:memory:` sqlite-node test client. Typed `NotFound` on `update` and the two
 * by-merchant lookups; no uniqueness constraint (faithful port), so writes collapse
 * a `SqlError` to a 500 defect ({@link orDieSql}) — no `Conflict`. The `list`
 * `merchantId?` + `status?` filters compose with `AND` (contract §2.7), replacing
 * the old either/or precedence.
 */
export class SubscriptionRepo extends Effect.Service<SubscriptionRepo>()(
	"api/SubscriptionRepo",
	{
		effect: Effect.gen(function* () {
			const sql = yield* SqlClient.SqlClient;

			// Each present filter contributes one predicate; absent ones contribute
			// nothing. `list` items + total share this WHERE (the old `merchantId >
			// status` precedence is gone — both compose with AND now).
			const buildConditions = (f: Filters): Array<Fragment> => {
				const conditions: Array<Fragment> = [];
				if (f.merchantId !== undefined)
					conditions.push(sql`merchantId = ${f.merchantId}`);
				if (f.status !== undefined) conditions.push(sql`status = ${f.status}`);
				return conditions;
			};

			// `sql.and` renders "()" for an empty list, not a valid WHERE body — fall
			// back to an empty fragment (no WHERE) when unfiltered.
			const whereClause = (f: Filters) => {
				const conditions = buildConditions(f);
				return conditions.length === 0
					? sql``
					: sql`WHERE ${sql.and(conditions)}`;
			};

			// `Request: Schema.Any` skips a redundant re-decode: filters are already
			// decoded + branded at the HTTP boundary (`SubscriptionListFilters`), and
			// the params bind through the `sql` fragments, not the Request schema. A
			// `Schema.Struct` Request can't co-exist with the dynamic where-fragment
			// interpolation.
			const listQuery = SqlSchema.findAll({
				Request: Schema.Any as Schema.Schema<ListFilter>,
				Result: SubscriptionFromRow,
				execute: (f) =>
					sql`SELECT * FROM subscriptions ${whereClause(f)} ORDER BY id LIMIT ${f.limit} OFFSET ${f.offset}`,
			});

			const countQuery = SqlSchema.single({
				Request: Schema.Any as Schema.Schema<Filters>,
				Result: CountResult,
				execute: (f) =>
					sql`SELECT COUNT(*) AS count FROM subscriptions ${whereClause(f)}`,
			});

			const byIdQuery = SqlSchema.findOne({
				Request: SubscriptionId,
				Result: SubscriptionFromRow,
				execute: (id) => sql`SELECT * FROM subscriptions WHERE id = ${id}`,
			});

			// First match for a merchant. `ORDER BY id LIMIT 1` makes "first"
			// deterministic (the old adapter's bare `LIMIT 1` relied on insertion order).
			const firstByMerchantQuery = SqlSchema.findOne({
				Request: Schema.Number,
				Result: SubscriptionFromRow,
				execute: (merchantId) =>
					sql`SELECT * FROM subscriptions WHERE merchantId = ${merchantId} ORDER BY id LIMIT 1`,
			});

			const byMerchantFrequencyQuery = SqlSchema.findOne({
				Request: Schema.Struct({
					merchantId: Schema.Number,
					frequency: Schema.String,
				}),
				Result: SubscriptionFromRow,
				execute: ({ merchantId, frequency }) =>
					sql`SELECT * FROM subscriptions WHERE merchantId = ${merchantId} AND frequency = ${frequency} ORDER BY id LIMIT 1`,
			});

			// Writes bind a plain `WriteRow`. `Request: Schema.Any` because the row is
			// already a plain object (built in `create`/`update`), not something to
			// decode; only the `Result` decode (RETURNING → entity) matters here.
			const insertQuery = SqlSchema.single({
				Request: Schema.Any as Schema.Schema<WriteRow>,
				Result: SubscriptionFromRow,
				execute: (row) =>
					sql`INSERT INTO subscriptions ${sql.insert(row)} RETURNING *`,
			});

			const updateQuery = SqlSchema.single({
				Request: Schema.Any as Schema.Schema<
					WriteRow & { id: typeof SubscriptionId.Type }
				>,
				Result: SubscriptionFromRow,
				execute: (row) =>
					sql`UPDATE subscriptions SET ${sql.update(row, ["id"])} WHERE id = ${row.id} RETURNING *`,
			});

			/** Unwrap a lookup's `Option`, 404-ing when absent (the key goes on the error). */
			const requireOne = (
				found: Option.Option<Subscription>,
				key: string | number,
			): Effect.Effect<Subscription, NotFound> =>
				Option.match(found, {
					onNone: () =>
						Effect.fail(new NotFound({ resource: "subscription", id: key })),
					onSome: Effect.succeed,
				});

			// Fold the entity fields into the JSON-string write row. A `SubscriptionCreate`
			// payload and a full merged `Subscription` both satisfy the input type; the
			// server assigns only `id`, so every other column is caller-provided
			// (faithful — the old adapter accepted all fields, dates included).
			const toWriteFields = (s: SubscriptionCreate): WriteRow => ({
				merchantId: s.merchantId,
				merchantName: s.merchantName,
				typicalAmount: s.typicalAmount,
				frequency: s.frequency,
				intervalDays: s.intervalDays,
				lastChargeDate: s.lastChargeDate,
				firstChargeDate: s.firstChargeDate,
				chargeCount: s.chargeCount,
				status: s.status,
				transactionIds: Schema.encodeSync(TransactionIdsJson)(s.transactionIds),
				detectedAt: s.detectedAt,
				updatedAt: s.updatedAt,
			});

			const list = (filter: ListFilter) =>
				Effect.all({
					items: listQuery(filter),
					total: countQuery({
						merchantId: filter.merchantId,
						status: filter.status,
					}).pipe(Effect.map((r) => r.count)),
				}).pipe(
					Effect.map((paged) => PagedSubscription.make(paged)),
					orDieSql,
				);

			const getById = (id: typeof SubscriptionId.Type) =>
				byIdQuery(id).pipe(
					orDieSql,
					Effect.flatMap((found) => requireOne(found, id)),
				);

			const getFirstByMerchant = (merchantId: typeof MerchantId.Type) =>
				firstByMerchantQuery(merchantId).pipe(
					orDieSql,
					Effect.flatMap((found) => requireOne(found, merchantId)),
				);

			const getByMerchantFrequency = (
				merchantId: typeof MerchantId.Type,
				frequency: SubscriptionFrequency,
			) =>
				byMerchantFrequencyQuery({ merchantId, frequency }).pipe(
					orDieSql,
					// Keyed by merchant + frequency; the frequency is the caller-facing
					// discriminator, so it goes on the 404 (the merchant is known).
					Effect.flatMap((found) => requireOne(found, frequency)),
				);

			const create = (payload: SubscriptionCreate) =>
				insertQuery(toWriteFields(payload)).pipe(orDieSql);

			const update = (
				id: typeof SubscriptionId.Type,
				changes: SubscriptionUpdate,
			) =>
				getById(id).pipe(
					// getById already 404s if missing; the write then always hits a row.
					// Merge current + changes into a full entity, then re-write every column.
					Effect.flatMap((current) => {
						const merged = new Subscription({ ...current, ...changes });
						return updateQuery({ id, ...toWriteFields(merged) }).pipe(orDieSql);
					}),
				);

			return {
				list,
				getFirstByMerchant,
				getByMerchantFrequency,
				create,
				update,
			} as const;
		}),
	},
) {}

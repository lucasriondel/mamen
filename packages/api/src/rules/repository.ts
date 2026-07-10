import { SqlClient, SqlSchema } from "@effect/sql";
import {
	type MerchantId,
	NotFound,
	Paged,
	Rule,
	type RuleCreate,
	RuleId,
	type RuleUpdate,
} from "@mamen/shared/contract";
import { Clock, Effect, Option, Schema } from "effect";
import { orDieSql } from "../db/errors";

/**
 * A stored rule row. `categoryOverride` is a nullable INTEGER (a category id
 * despite the name) coming back as `null` (not absent); `createdAt` is ISO-8601
 * TEXT. {@link RuleFromRow} folds `categoryOverride: null` -> absent so the
 * handlers only ever see the wire `Rule`.
 */
const RuleRow = Schema.Struct({
	id: Schema.Number,
	merchantId: Schema.Number,
	pattern: Schema.String,
	categoryOverride: Schema.NullOr(Schema.Number),
	matchCount: Schema.Number,
	createdAt: Schema.String,
});

/**
 * `Schema.transform` maps `RuleRow`'s decoded type to `Rule`'s *encoded* shape
 * (ISO string `createdAt`, present-or-absent `categoryOverride`, plain-number
 * ids); `Rule`'s own schema then decodes that into the class. This is where the
 * `categoryOverride: null` -> absent fold lives, so reads yield the entity.
 *
 * Exported for the round-trip test: reads decode through it (via `SqlSchema`),
 * and the storage inverse (`encode`) is verified directly rather than left dead,
 * since the write path builds its row with the hand-written `toWriteFields` below.
 */
export const RuleFromRow = Schema.transform(RuleRow, Rule, {
	strict: true,
	decode: (row) => ({
		id: row.id,
		merchantId: row.merchantId,
		pattern: row.pattern,
		...(row.categoryOverride !== null
			? { categoryOverride: row.categoryOverride }
			: {}),
		matchCount: row.matchCount,
		createdAt: row.createdAt,
	}),
	encode: (r) => ({
		id: r.id,
		merchantId: r.merchantId,
		pattern: r.pattern,
		categoryOverride: r.categoryOverride ?? null,
		matchCount: r.matchCount,
		createdAt: r.createdAt,
	}),
});

const PagedRule = Paged(Rule);

/** Number of rows in a `count(*)` result. */
const CountResult = Schema.Struct({ count: Schema.Number });

/** The `list` filter, decoded from the query string (`merchantId` optional). */
type ListFilter = {
	limit: number;
	offset: number;
	merchantId?: typeof MerchantId.Type;
};

/** A plain null-mapped write row (the shape bound into INSERT/UPDATE). */
type WriteRow = {
	merchantId: number;
	pattern: string;
	categoryOverride: number | null;
	matchCount: number;
	createdAt: string;
};

/**
 * The rules repository, on `@effect/sql`. Depends only on the generic
 * `SqlClient.SqlClient` tag, so it runs unchanged against the Bun prod client
 * and the `:memory:` sqlite-node test client. Typed `NotFound` on the by-id /
 * by-merchant-pattern lookups; no uniqueness constraint (faithful port), so
 * writes collapse a `SqlError` to a 500 defect ({@link orDieSql}) -- no
 * `Conflict`.
 */
export class RuleRepo extends Effect.Service<RuleRepo>()("api/RuleRepo", {
	effect: Effect.gen(function* () {
		const sql = yield* SqlClient.SqlClient;

		// The `merchantId` filter (contract §2.6): present -> that merchant's rules,
		// absent -> the whole table. `list` and `count` share it.
		const whereClause = (merchantId: number | undefined) =>
			merchantId === undefined
				? sql``
				: sql`WHERE merchantId = ${merchantId}`;

		// `Request: Schema.Any` skips a redundant re-decode: the filter is already
		// decoded + branded at the HTTP boundary (`RuleListFilters` via
		// `numFromStr(MerchantId)`), and the params bind through the `sql` fragment
		// below, not the Request schema. A `Schema.Struct` Request can't co-exist
		// with the dynamic where-fragment interpolation.
		const listQuery = SqlSchema.findAll({
			Request: Schema.Any as Schema.Schema<ListFilter>,
			Result: RuleFromRow,
			execute: ({ limit, offset, merchantId }) =>
				sql`SELECT * FROM rules ${whereClause(merchantId)} ORDER BY id LIMIT ${limit} OFFSET ${offset}`,
		});

		const countQuery = SqlSchema.single({
			Request: Schema.Any as Schema.Schema<{ merchantId?: number }>,
			Result: CountResult,
			execute: ({ merchantId }) =>
				sql`SELECT COUNT(*) AS count FROM rules ${whereClause(merchantId)}`,
		});

		const byIdQuery = SqlSchema.findOne({
			Request: RuleId,
			Result: RuleFromRow,
			execute: (id) => sql`SELECT * FROM rules WHERE id = ${id}`,
		});

		const byMerchantPatternQuery = SqlSchema.findOne({
			Request: Schema.Struct({
				merchantId: Schema.Number,
				pattern: Schema.String,
			}),
			Result: RuleFromRow,
			execute: ({ merchantId, pattern }) =>
				sql`SELECT * FROM rules WHERE merchantId = ${merchantId} AND pattern = ${pattern}`,
		});

		// Writes bind a plain null-mapped `WriteRow`. `Request: Schema.Any` because
		// the row is already a plain object (built in `create`/`update`), not
		// something to decode; only the `Result` decode (RETURNING -> entity) matters.
		const insertQuery = SqlSchema.single({
			Request: Schema.Any as Schema.Schema<WriteRow>,
			Result: RuleFromRow,
			execute: (row) => sql`INSERT INTO rules ${sql.insert(row)} RETURNING *`,
		});

		const updateQuery = SqlSchema.single({
			Request: Schema.Any as Schema.Schema<
				WriteRow & { id: typeof RuleId.Type }
			>,
			Result: RuleFromRow,
			execute: (row) =>
				sql`UPDATE rules SET ${sql.update(row, ["id"])} WHERE id = ${row.id} RETURNING *`,
		});

		const nowIso = Clock.currentTimeMillis.pipe(
			Effect.map((millis) => new Date(millis).toISOString()),
		);

		/** Unwrap a lookup's `Option`, 404-ing when absent (the key goes on the error). */
		const requireOne = (
			found: Option.Option<Rule>,
			key: string | number,
		): Effect.Effect<Rule, NotFound> =>
			Option.match(found, {
				onNone: () => Effect.fail(new NotFound({ resource: "rule", id: key })),
				onSome: Effect.succeed,
			});

		// Fold the caller-owned fields (everything but `createdAt`) into the
		// null-mapped shape the write binds: an absent `categoryOverride` -> `null`.
		// `createdAt` is the one column that differs by path -- server-stamped on
		// create, preserved on update -- so each caller supplies it. Both a
		// `RuleCreate` payload and a full merged `Rule` satisfy the input type.
		const toWriteFields = (r: RuleCreate): Omit<WriteRow, "createdAt"> => ({
			merchantId: r.merchantId,
			pattern: r.pattern,
			categoryOverride: r.categoryOverride ?? null,
			matchCount: r.matchCount,
		});

		const list = (filter: ListFilter) =>
			Effect.all({
				items: listQuery(filter),
				total: countQuery({ merchantId: filter.merchantId }).pipe(
					Effect.map((r) => r.count),
				),
			}).pipe(
				Effect.map((paged) => PagedRule.make(paged)),
				orDieSql,
			);

		const count = (merchantId: typeof MerchantId.Type | undefined) =>
			countQuery({ merchantId }).pipe(orDieSql);

		const getById = (id: typeof RuleId.Type) =>
			byIdQuery(id).pipe(
				orDieSql,
				Effect.flatMap((found) => requireOne(found, id)),
			);

		const getByMerchantPattern = (
			merchantId: typeof MerchantId.Type,
			pattern: string,
		) =>
			byMerchantPatternQuery({ merchantId, pattern }).pipe(
				orDieSql,
				// The lookup is keyed by merchant + pattern; the pattern is the
				// caller-facing key, so it goes on the 404 (the merchant is known).
				Effect.flatMap((found) => requireOne(found, pattern)),
			);

		const create = (payload: RuleCreate) =>
			nowIso.pipe(
				Effect.flatMap((now) =>
					insertQuery({ ...toWriteFields(payload), createdAt: now }),
				),
				orDieSql,
			);

		const update = (id: typeof RuleId.Type, changes: RuleUpdate) =>
			getById(id).pipe(
				// getById already 404s if missing; the write then always hits a row.
				// Merge current + changes into a full entity, then re-write every
				// column (preserving the original `createdAt`).
				Effect.flatMap((current) => {
					const merged = new Rule({ ...current, ...changes });
					return updateQuery({
						id,
						...toWriteFields(merged),
						createdAt: merged.createdAt.toISOString(),
					}).pipe(orDieSql);
				}),
			);

		const remove = (id: typeof RuleId.Type) =>
			getById(id).pipe(
				Effect.flatMap(() => orDieSql(sql`DELETE FROM rules WHERE id = ${id}`)),
				Effect.asVoid,
			);

		return {
			list,
			count,
			getById,
			getByMerchantPattern,
			create,
			update,
			remove,
		} as const;
	}),
}) {}

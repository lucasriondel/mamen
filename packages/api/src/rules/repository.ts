import { SqlClient, SqlSchema } from "@effect/sql";
import {
	type IssuerId,
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
 * A stored rule row. `createdAt` is ISO-8601 TEXT; the branded ids come back as
 * plain numbers. {@link RuleFromRow} decodes it into the wire `Rule` (a Matching
 * Rule assigns only an issuer — there is no category column). The one nullable
 * column is `matchValue` (the optional Value matcher, issue #42): SQL `NULL`
 * folds to an absent wire field.
 */
const RuleRow = Schema.Struct({
	id: Schema.Number,
	issuerId: Schema.Number,
	pattern: Schema.String,
	matchValue: Schema.NullOr(Schema.Number),
	matchCount: Schema.Number,
	createdAt: Schema.String,
});

/**
 * `Schema.transform` maps `RuleRow`'s decoded type to `Rule`'s *encoded* shape
 * (ISO string `createdAt`, plain-number ids); `Rule`'s own schema then decodes
 * that into the class.
 *
 * Exported for the round-trip test: reads decode through it (via `SqlSchema`),
 * and the storage inverse (`encode`) is verified directly rather than left dead,
 * since the write path builds its row with the hand-written `toWriteFields` below.
 */
export const RuleFromRow = Schema.transform(RuleRow, Rule, {
	strict: true,
	decode: (row) => ({
		id: row.id,
		issuerId: row.issuerId,
		pattern: row.pattern,
		// `NULL` matchValue folds to an absent wire field (a regex-only rule).
		...(row.matchValue !== null ? { matchValue: row.matchValue } : {}),
		matchCount: row.matchCount,
		createdAt: row.createdAt,
	}),
	encode: (r) => ({
		id: r.id,
		issuerId: r.issuerId,
		pattern: r.pattern,
		matchValue: r.matchValue ?? null,
		matchCount: r.matchCount,
		createdAt: r.createdAt,
	}),
});

const PagedRule = Paged(Rule);

/** Number of rows in a `count(*)` result. */
const CountResult = Schema.Struct({ count: Schema.Number });

/** The `list` filter, decoded from the query string (`issuerId` optional). */
type ListFilter = {
	limit: number;
	offset: number;
	issuerId?: typeof IssuerId.Type;
};

/** A plain write row (the shape bound into INSERT/UPDATE). */
type WriteRow = {
	issuerId: number;
	pattern: string;
	matchValue: number | null;
	matchCount: number;
	createdAt: string;
};

/**
 * The rules repository, on `@effect/sql`. Depends only on the generic
 * `SqlClient.SqlClient` tag, so it runs unchanged against the Bun prod client
 * and the `:memory:` sqlite-node test client. Typed `NotFound` on the by-id /
 * by-issuer-pattern lookups; no uniqueness constraint (faithful port), so
 * writes collapse a `SqlError` to a 500 defect ({@link orDieSql}) -- no
 * `Conflict`.
 */
export class RuleRepo extends Effect.Service<RuleRepo>()("api/RuleRepo", {
	effect: Effect.gen(function* () {
		const sql = yield* SqlClient.SqlClient;

		// The `issuerId` filter (contract §2.6): present -> that issuer's rules,
		// absent -> the whole table. `list` and `count` share it.
		const whereClause = (issuerId: number | undefined) =>
			issuerId === undefined ? sql`` : sql`WHERE issuerId = ${issuerId}`;

		// `Request: Schema.Any` skips a redundant re-decode: the filter is already
		// decoded + branded at the HTTP boundary (`RuleListFilters` via
		// `numFromStr(IssuerId)`), and the params bind through the `sql` fragment
		// below, not the Request schema. A `Schema.Struct` Request can't co-exist
		// with the dynamic where-fragment interpolation.
		const listQuery = SqlSchema.findAll({
			Request: Schema.Any as Schema.Schema<ListFilter>,
			Result: RuleFromRow,
			execute: ({ limit, offset, issuerId }) =>
				sql`SELECT * FROM rules ${whereClause(issuerId)} ORDER BY id LIMIT ${limit} OFFSET ${offset}`,
		});

		const countQuery = SqlSchema.single({
			Request: Schema.Any as Schema.Schema<{ issuerId?: number }>,
			Result: CountResult,
			execute: ({ issuerId }) =>
				sql`SELECT COUNT(*) AS count FROM rules ${whereClause(issuerId)}`,
		});

		const byIdQuery = SqlSchema.findOne({
			Request: RuleId,
			Result: RuleFromRow,
			execute: (id) => sql`SELECT * FROM rules WHERE id = ${id}`,
		});

		const byIssuerPatternQuery = SqlSchema.findOne({
			Request: Schema.Struct({
				issuerId: Schema.Number,
				pattern: Schema.String,
			}),
			Result: RuleFromRow,
			execute: ({ issuerId, pattern }) =>
				sql`SELECT * FROM rules WHERE issuerId = ${issuerId} AND pattern = ${pattern}`,
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

		// Fold the caller-owned fields (everything but `createdAt`) into the shape
		// the write binds. `createdAt` is the one column that differs by path --
		// server-stamped on create, preserved on update -- so each caller supplies
		// it. Both a `RuleCreate` payload and a full merged `Rule` satisfy the input.
		const toWriteFields = (r: RuleCreate): Omit<WriteRow, "createdAt"> => ({
			issuerId: r.issuerId,
			pattern: r.pattern,
			matchValue: r.matchValue ?? null,
			matchCount: r.matchCount,
		});

		const list = (filter: ListFilter) =>
			Effect.all({
				items: listQuery(filter),
				total: countQuery({ issuerId: filter.issuerId }).pipe(
					Effect.map((r) => r.count),
				),
			}).pipe(
				Effect.map((paged) => PagedRule.make(paged)),
				orDieSql,
			);

		const count = (issuerId: typeof IssuerId.Type | undefined) =>
			countQuery({ issuerId }).pipe(orDieSql);

		const getById = (id: typeof RuleId.Type) =>
			byIdQuery(id).pipe(
				orDieSql,
				Effect.flatMap((found) => requireOne(found, id)),
			);

		const getByIssuerPattern = (
			issuerId: typeof IssuerId.Type,
			pattern: string,
		) =>
			byIssuerPatternQuery({ issuerId, pattern }).pipe(
				orDieSql,
				// The lookup is keyed by issuer + pattern; the pattern is the
				// caller-facing key, so it goes on the 404 (the issuer is known).
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
					// Three-way Value-matcher patch (issue #43): key absent ⇒ keep
					// current, explicit `null` ⇒ clear, number ⇒ set. `null` can't reach
					// `new Rule` (positive number field), so fold it to `undefined`.
					const matchValue =
						changes.matchValue === undefined
							? current.matchValue
							: (changes.matchValue ?? undefined);
					const merged = new Rule({ ...current, ...changes, matchValue });
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
			getByIssuerPattern,
			create,
			update,
			remove,
		} as const;
	}),
}) {}

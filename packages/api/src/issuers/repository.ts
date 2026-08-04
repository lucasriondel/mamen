import { SqlClient, SqlSchema } from "@effect/sql";
import {
	CategoryNotLeaf,
	Issuer,
	type IssuerCreate,
	IssuerId,
	type IssuerUpdate,
	NotFound,
	Paged,
} from "@mamen/shared/contract";
import { Clock, Effect, Option, Schema } from "effect";
import { orDieSql } from "../db/errors";

/**
 * A stored issuer row — timestamps are ISO-8601 TEXT and the two optional
 * columns come back as `null` (not absent). `IssuerFromRow` decodes a row into
 * an `Issuer`, folding `null` → absent so the wire shape matches the contract's
 * `Schema.optional(...)`. Every read decodes through this, so the entity is the
 * single result type the handlers see.
 */
const IssuerRow = Schema.Struct({
	id: Schema.Number,
	name: Schema.String,
	imageUrl: Schema.NullOr(Schema.String),
	// Plain `Number` (not branded `CategoryId`): the branding is an
	// entity-boundary guard, and the row is a raw storage shape that decodes
	// straight into `Issuer`'s encoded form (where the brand is a plain number).
	defaultCategoryId: Schema.NullOr(Schema.Number),
	notes: Schema.NullOr(Schema.String),
	// The recap-exclusion default (issue #69, ADR 0008) — a 0/1 `INTEGER`, folded
	// `1` → `true` / `0` → absent like the transaction flags it is read against.
	excludedFromRecap: Schema.Number,
	createdAt: Schema.String,
	firstSeen: Schema.String,
});

// `Schema.transform` maps `IssuerRow`'s decoded type to `Issuer`'s *encoded*
// shape (string timestamps; optional fields present-or-absent) — `Issuer`'s
// own schema then decodes that into the class (strings → `Date`). This is where
// the null → absent fold for the two optional columns lives; a stored `null`
// becomes an omitted key so the wire shape matches `Schema.optional(...)`.
//
// Exported for the database export/import port: `decode` reads a row into a
// `Issuer` (used by `exportAll`), `encode` folds an `Issuer` back to its
// stored row (used by `import`, id preserved).
export const IssuerFromRow = Schema.transform(IssuerRow, Issuer, {
	strict: true,
	decode: (row) => ({
		id: row.id,
		name: row.name,
		...(row.imageUrl !== null ? { imageUrl: row.imageUrl } : {}),
		...(row.defaultCategoryId !== null
			? { defaultCategoryId: row.defaultCategoryId }
			: {}),
		...(row.notes !== null ? { notes: row.notes } : {}),
		...(row.excludedFromRecap === 1 ? { excludedFromRecap: true } : {}),
		createdAt: row.createdAt,
		firstSeen: row.firstSeen,
	}),
	encode: (m) => ({
		id: m.id,
		name: m.name,
		imageUrl: m.imageUrl ?? null,
		defaultCategoryId: m.defaultCategoryId ?? null,
		notes: m.notes ?? null,
		excludedFromRecap: m.excludedFromRecap === true ? 1 : 0,
		createdAt: m.createdAt,
		firstSeen: m.firstSeen,
	}),
});

const PagedIssuer = Paged(Issuer);

/** Number of rows in a `count(*)` result. */
const CountResult = Schema.Struct({ count: Schema.Number });

/**
 * The `list` filter, decoded from the query string (`orderBy`/`id`/`search`
 * optional). `id` is a single id or a set — the by-ids read (#62); `search` is
 * a name substring — the picker read (#79).
 */
type ListFilter = {
	limit: number;
	offset: number;
	orderBy?: "name";
	id?: number | ReadonlyArray<number>;
	search?: string;
};

/** A null-mapped write row (the shape bound into INSERT/UPDATE statements). */
type WriteRow = {
	name: string;
	imageUrl: string | null;
	defaultCategoryId: number | null;
	notes: string | null;
	excludedFromRecap: number;
	createdAt: string;
	firstSeen: string;
};

/**
 * The issuer repository, on `@effect/sql`. Depends only on the generic
 * `SqlClient.SqlClient` tag, so it runs unchanged against the Bun prod client
 * and the `:memory:` sqlite-node test client. Typed `NotFound` on the by-id /
 * by-name / by-name-ci lookups; `name` has no uniqueness constraint (faithful
 * port), so writes collapse a `SqlError` to a 500 defect ({@link orDieSql}) — no
 * `Conflict`. The image-file side of `uploadImage`/`deleteImage` lives in the
 * handler; this repo only sets/clears the `imageUrl` column via `update`.
 *
 * `create`/`update` guard `defaultCategoryId` against the Leaf-assignable
 * invariant (ADR 0003) via {@link assertLeaf} — a node with children is rejected
 * as `CategoryNotLeaf`.
 * `update` additionally treats a `null` `defaultCategoryId` as a *clear*.
 */
export class IssuerRepo extends Effect.Service<IssuerRepo>()("api/IssuerRepo", {
	effect: Effect.gen(function* () {
		const sql = yield* SqlClient.SqlClient;

		// Faithful to today: `orderBy=name` orders case-insensitively by name
		// (matching the old `ORDER BY name COLLATE NOCASE ASC`), else natural
		// insertion order (`id`).
		const orderClause = (orderBy: "name" | undefined) =>
			orderBy === "name"
				? sql`ORDER BY name COLLATE NOCASE ASC`
				: sql`ORDER BY id`;

		// The `id` filter (#62): narrows to the ids a caller is actually showing.
		// A lone id and a repeated one arrive as a number and an array
		// respectively, so both normalise to a set here. An empty set renders
		// `1 = 0` rather than no predicate at all — asking to resolve nothing must
		// return nothing, where dropping the filter would return everything
		// (`sql.in([])` would also render an invalid `IN ()`).
		const idCondition = (id: ListFilter["id"]) => {
			const ids = Array.isArray(id) ? id : [id as number];
			return ids.length === 0 ? sql`1 = 0` : sql.in("id", ids);
		};

		// The `search` filter (#79): a case-insensitive substring of the name —
		// what a picker asks as the user types. Same shape as the transactions
		// free-text filter: `\` escapes the LIKE metachars `%` `_` so a user
		// typing them means them literally, and every LIKE carries `ESCAPE '\'`.
		// A blank term is *not* a predicate: an empty picker box asks for a page
		// to browse, the opposite of an empty `id` set.
		const searchCondition = (search: string) => {
			const like = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
			return sql`name LIKE ${like} ESCAPE '\\'`;
		};

		// The filters AND: a caller may search *within* a set of ids. An
		// unfiltered read contributes no WHERE at all, so the whole-table reads
		// are untouched (`sql.and([])` would render an invalid `()`).
		const whereClause = ({ id, search }: Pick<ListFilter, "id" | "search">) => {
			const conditions = [
				...(id !== undefined ? [idCondition(id)] : []),
				...(search?.trim() ? [searchCondition(search.trim())] : []),
			];
			return conditions.length === 0
				? sql``
				: sql`WHERE ${sql.and(conditions)}`;
		};

		// `Request: Schema.Any` skips a redundant re-decode: the filter is
		// already decoded at the HTTP boundary (`IssuerListFilters`), and the
		// params bind through the `sql` fragments, not the Request schema. A
		// `Schema.Struct` Request can't co-exist with the dynamic order fragment.
		const listQuery = SqlSchema.findAll({
			Request: Schema.Any as Schema.Schema<ListFilter>,
			Result: IssuerFromRow,
			execute: ({ limit, offset, orderBy, id, search }) =>
				sql`SELECT * FROM issuers ${whereClause({ id, search })} ${orderClause(orderBy)} LIMIT ${limit} OFFSET ${offset}`,
		});

		// Counts the *filtered* set, sharing `whereClause` with the read above so
		// `total` can never describe a different set than `items` pages through.
		const countQuery = SqlSchema.single({
			Request: Schema.Any as Schema.Schema<Pick<ListFilter, "id" | "search">>,
			Result: CountResult,
			execute: (f) =>
				sql`SELECT COUNT(*) AS count FROM issuers ${whereClause(f)}`,
		});

		const byIdQuery = SqlSchema.findOne({
			Request: IssuerId,
			Result: IssuerFromRow,
			execute: (id) => sql`SELECT * FROM issuers WHERE id = ${id}`,
		});

		const byNameQuery = SqlSchema.findOne({
			Request: Schema.String,
			Result: IssuerFromRow,
			execute: (name) => sql`SELECT * FROM issuers WHERE name = ${name}`,
		});

		const byNameCiQuery = SqlSchema.findOne({
			Request: Schema.String,
			Result: IssuerFromRow,
			execute: (name) =>
				sql`SELECT * FROM issuers WHERE name COLLATE NOCASE = ${name}`,
		});

		// One indexed existence probe of a category's children — the
		// childlessness test for the Leaf-assignable invariant (ADR 0003) below.
		// A row means the category has children (a folder, unassignable); none
		// means it is childless (a leaf, assignable) at any depth. Rides
		// `idx_categories_parentId`.
		const hasChildrenQuery = SqlSchema.findOne({
			Request: Schema.Number,
			Result: Schema.Struct({ one: Schema.Number }),
			execute: (id) =>
				sql`SELECT 1 AS one FROM categories WHERE parentId = ${id} LIMIT 1`,
		});

		// Writes bind a plain null-mapped `WriteRow` object. `Request: Schema.Any`
		// because the row is already a plain object (built in `create`/`update`),
		// not something to decode; only the `Result` decode (RETURNING → entity)
		// matters here.
		const insertQuery = SqlSchema.single({
			Request: Schema.Any as Schema.Schema<WriteRow>,
			Result: IssuerFromRow,
			execute: (row) => sql`INSERT INTO issuers ${sql.insert(row)} RETURNING *`,
		});

		const updateQuery = SqlSchema.single({
			Request: Schema.Any as Schema.Schema<
				WriteRow & { id: typeof IssuerId.Type }
			>,
			Result: IssuerFromRow,
			execute: (row) =>
				sql`UPDATE issuers SET ${sql.update(row, ["id"])} WHERE id = ${row.id} RETURNING *`,
		});

		// One hoisted query for both `setImage` and `clearImage` — a `string`
		// sets the column, `null` clears it. Keeps the `RETURNING *` + decode
		// shape in a single place (the other writes are hoisted too).
		const setImageUrlQuery = SqlSchema.single({
			Request: Schema.Any as Schema.Schema<{
				id: typeof IssuerId.Type;
				imageUrl: string | null;
			}>,
			Result: IssuerFromRow,
			execute: ({ id, imageUrl }) =>
				sql`UPDATE issuers SET imageUrl = ${imageUrl} WHERE id = ${id} RETURNING *`,
		});

		const nowIso = Clock.currentTimeMillis.pipe(
			Effect.map((millis) => new Date(millis).toISOString()),
		);

		/** Unwrap a lookup's `Option`, 404-ing when absent (the key goes on the error). */
		const requireOne = (
			found: Option.Option<Issuer>,
			key: string | number,
		): Effect.Effect<Issuer, NotFound> =>
			Option.match(found, {
				onNone: () =>
					Effect.fail(new NotFound({ resource: "issuer", id: key })),
				onSome: Effect.succeed,
			});

		/**
		 * The Leaf-assignable invariant (ADR 0003) at the issuers door: a default
		 * category must be an assignable **leaf** (a category with no children),
		 * never a **folder**. Assignability is childlessness, not root-ness — a
		 * childless node is a leaf at *any* depth. A folder-assigned issuer would
		 * hang its transactions off a node the category rollup visits but never
		 * counts, understating the total with no error on screen — so reject at
		 * the write boundary, the same door the UI and any future writer share.
		 * Absent (`undefined`) or a clear (`null`) skips the check; an unknown id
		 * is left to pass (no FK exists — policing missing rows is not this
		 * invariant's job).
		 */
		const assertLeaf = (
			categoryId: number | null | undefined,
		): Effect.Effect<void, CategoryNotLeaf> =>
			categoryId == null
				? Effect.void
				: hasChildrenQuery(categoryId).pipe(
						orDieSql,
						Effect.flatMap((found) =>
							Option.isSome(found)
								? Effect.fail(new CategoryNotLeaf({ categoryId }))
								: Effect.void,
						),
					);

		/** Fold an entity into a plain, null-mapped write row (drops `id`). */
		const toWriteRow = (m: Issuer): WriteRow => ({
			name: m.name,
			imageUrl: m.imageUrl ?? null,
			defaultCategoryId: m.defaultCategoryId ?? null,
			notes: m.notes ?? null,
			excludedFromRecap: m.excludedFromRecap === true ? 1 : 0,
			createdAt: m.createdAt.toISOString(),
			firstSeen: m.firstSeen.toISOString(),
		});

		const list = (filter: ListFilter) =>
			Effect.all({
				items: listQuery(filter),
				total: countQuery({ id: filter.id, search: filter.search }).pipe(
					Effect.map((r) => r.count),
				),
			}).pipe(
				Effect.map((paged) => PagedIssuer.make(paged)),
				orDieSql,
			);

		const getById = (id: typeof IssuerId.Type) =>
			byIdQuery(id).pipe(
				orDieSql,
				Effect.flatMap((found) => requireOne(found, id)),
			);

		const getByName = (name: string) =>
			byNameQuery(name).pipe(
				orDieSql,
				Effect.flatMap((found) => requireOne(found, name)),
			);

		const getByNameCi = (name: string) =>
			byNameCiQuery(name).pipe(
				orDieSql,
				Effect.flatMap((found) => requireOne(found, name)),
			);

		const create = (payload: IssuerCreate) =>
			assertLeaf(payload.defaultCategoryId).pipe(
				Effect.andThen(
					nowIso.pipe(
						Effect.flatMap((now) =>
							insertQuery({
								name: payload.name,
								imageUrl: payload.imageUrl ?? null,
								defaultCategoryId: payload.defaultCategoryId ?? null,
								notes: payload.notes ?? null,
								excludedFromRecap: payload.excludedFromRecap === true ? 1 : 0,
								createdAt: now,
								firstSeen: payload.firstSeen.toISOString(),
							}),
						),
						orDieSql,
					),
				),
			);

		const update = (id: typeof IssuerId.Type, changes: IssuerUpdate) =>
			assertLeaf(changes.defaultCategoryId).pipe(
				// getById already 404s if missing; the write then always hits a row.
				Effect.andThen(getById(id)),
				Effect.flatMap((current) => {
					// A `null` in `changes` *clears* the default, an absent one leaves
					// it unchanged. `new Issuer` can't carry a null defaultCategoryId
					// (its field is optional, not nullable), so merge every other field
					// through it and set the FK on the write row directly.
					const defaultCategoryId =
						changes.defaultCategoryId !== undefined
							? changes.defaultCategoryId
							: (current.defaultCategoryId ?? null);
					// `notes` is nullable-to-clear for the same reason and needs the
					// same treatment — an emptied note arrives as `null` and must
					// reach the column, not be dropped by `Issuer`'s optional field.
					const notes =
						changes.notes !== undefined
							? changes.notes
							: (current.notes ?? null);
					const merged = new Issuer({
						...current,
						...changes,
						defaultCategoryId: current.defaultCategoryId,
						notes: current.notes,
					});
					return updateQuery({
						...toWriteRow(merged),
						id,
						defaultCategoryId,
						notes,
					}).pipe(orDieSql);
				}),
			);

		/**
		 * Set the `imageUrl` column (used by `uploadImage`). Distinct from
		 * `update` because a partial update can't distinguish "leave imageUrl
		 * unchanged" from "set it" — this always writes the column. Returns the
		 * updated `Issuer`; the caller has already fetched it (404 handled).
		 */
		const setImage = (id: typeof IssuerId.Type, imageUrl: string) =>
			setImageUrlQuery({ id, imageUrl }).pipe(orDieSql);

		/**
		 * Clear the `imageUrl` column to NULL (used by `deleteImage`). A partial
		 * `update({ imageUrl: undefined })` means "no change", so clearing needs
		 * this explicit write. Returns the updated `Issuer` (`imageUrl` absent).
		 */
		const clearImage = (id: typeof IssuerId.Type) =>
			setImageUrlQuery({ id, imageUrl: null }).pipe(orDieSql);

		const remove = (id: typeof IssuerId.Type) =>
			getById(id).pipe(
				Effect.flatMap(() =>
					orDieSql(sql`DELETE FROM issuers WHERE id = ${id}`),
				),
				Effect.asVoid,
			);

		return {
			list,
			getById,
			getByName,
			getByNameCi,
			create,
			update,
			remove,
			setImage,
			clearImage,
		} as const;
	}),
}) {}

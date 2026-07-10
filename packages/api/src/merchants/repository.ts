import { SqlClient, SqlSchema } from "@effect/sql";
import {
	Merchant,
	type MerchantCreate,
	MerchantId,
	type MerchantUpdate,
	NotFound,
	Paged,
} from "@mamen/shared/contract";
import { Clock, Effect, Option, Schema } from "effect";
import { orDieSql } from "../db/errors";

/**
 * A stored merchant row — timestamps are ISO-8601 TEXT and the two optional
 * columns come back as `null` (not absent). `MerchantFromRow` decodes a row into
 * a `Merchant`, folding `null` → absent so the wire shape matches the contract's
 * `Schema.optional(...)`. Every read decodes through this, so the entity is the
 * single result type the handlers see.
 */
const MerchantRow = Schema.Struct({
	id: Schema.Number,
	name: Schema.String,
	imageUrl: Schema.NullOr(Schema.String),
	// Plain `Number` (not branded `CategoryId`): the branding is an
	// entity-boundary guard, and the row is a raw storage shape that decodes
	// straight into `Merchant`'s encoded form (where the brand is a plain number).
	defaultCategoryId: Schema.NullOr(Schema.Number),
	createdAt: Schema.String,
	firstSeen: Schema.String,
});

// `Schema.transform` maps `MerchantRow`'s decoded type to `Merchant`'s *encoded*
// shape (string timestamps; optional fields present-or-absent) — `Merchant`'s
// own schema then decodes that into the class (strings → `Date`). This is where
// the null → absent fold for the two optional columns lives; a stored `null`
// becomes an omitted key so the wire shape matches `Schema.optional(...)`.
const MerchantFromRow = Schema.transform(MerchantRow, Merchant, {
	strict: true,
	decode: (row) => ({
		id: row.id,
		name: row.name,
		...(row.imageUrl !== null ? { imageUrl: row.imageUrl } : {}),
		...(row.defaultCategoryId !== null
			? { defaultCategoryId: row.defaultCategoryId }
			: {}),
		createdAt: row.createdAt,
		firstSeen: row.firstSeen,
	}),
	encode: (m) => ({
		id: m.id,
		name: m.name,
		imageUrl: m.imageUrl ?? null,
		defaultCategoryId: m.defaultCategoryId ?? null,
		createdAt: m.createdAt,
		firstSeen: m.firstSeen,
	}),
});

const PagedMerchant = Paged(Merchant);

/** Number of rows in a `count(*)` result. */
const CountResult = Schema.Struct({ count: Schema.Number });

/** The `list` filter, decoded from the query string (`orderBy` optional). */
type ListFilter = {
	limit: number;
	offset: number;
	orderBy?: "name";
};

/** A null-mapped write row (the shape bound into INSERT/UPDATE statements). */
type WriteRow = {
	name: string;
	imageUrl: string | null;
	defaultCategoryId: number | null;
	createdAt: string;
	firstSeen: string;
};

/**
 * The merchant repository, on `@effect/sql`. Depends only on the generic
 * `SqlClient.SqlClient` tag, so it runs unchanged against the Bun prod client
 * and the `:memory:` sqlite-node test client. Typed `NotFound` on the by-id /
 * by-name / by-name-ci lookups; `name` has no uniqueness constraint (faithful
 * port), so writes collapse a `SqlError` to a 500 defect ({@link orDieSql}) — no
 * `Conflict`. The image-file side of `uploadImage`/`deleteImage` lives in the
 * handler; this repo only sets/clears the `imageUrl` column via `update`.
 */
export class MerchantRepo extends Effect.Service<MerchantRepo>()(
	"api/MerchantRepo",
	{
		effect: Effect.gen(function* () {
			const sql = yield* SqlClient.SqlClient;

			// Faithful to today: `orderBy=name` orders case-insensitively by name
			// (matching the old `ORDER BY name COLLATE NOCASE ASC`), else natural
			// insertion order (`id`).
			const orderClause = (orderBy: "name" | undefined) =>
				orderBy === "name"
					? sql`ORDER BY name COLLATE NOCASE ASC`
					: sql`ORDER BY id`;

			// `Request: Schema.Any` skips a redundant re-decode: the filter is
			// already decoded at the HTTP boundary (`MerchantListFilters`), and the
			// params bind through the `sql` fragments, not the Request schema. A
			// `Schema.Struct` Request can't co-exist with the dynamic order fragment.
			const listQuery = SqlSchema.findAll({
				Request: Schema.Any as Schema.Schema<ListFilter>,
				Result: MerchantFromRow,
				execute: ({ limit, offset, orderBy }) =>
					sql`SELECT * FROM merchants ${orderClause(orderBy)} LIMIT ${limit} OFFSET ${offset}`,
			});

			const countQuery = SqlSchema.single({
				Request: Schema.Void,
				Result: CountResult,
				execute: () => sql`SELECT COUNT(*) AS count FROM merchants`,
			});

			const byIdQuery = SqlSchema.findOne({
				Request: MerchantId,
				Result: MerchantFromRow,
				execute: (id) => sql`SELECT * FROM merchants WHERE id = ${id}`,
			});

			const byNameQuery = SqlSchema.findOne({
				Request: Schema.String,
				Result: MerchantFromRow,
				execute: (name) => sql`SELECT * FROM merchants WHERE name = ${name}`,
			});

			const byNameCiQuery = SqlSchema.findOne({
				Request: Schema.String,
				Result: MerchantFromRow,
				execute: (name) =>
					sql`SELECT * FROM merchants WHERE name COLLATE NOCASE = ${name}`,
			});

			// Writes bind a plain null-mapped `WriteRow` object. `Request: Schema.Any`
			// because the row is already a plain object (built in `create`/`update`),
			// not something to decode; only the `Result` decode (RETURNING → entity)
			// matters here.
			const insertQuery = SqlSchema.single({
				Request: Schema.Any as Schema.Schema<WriteRow>,
				Result: MerchantFromRow,
				execute: (row) =>
					sql`INSERT INTO merchants ${sql.insert(row)} RETURNING *`,
			});

			const updateQuery = SqlSchema.single({
				Request: Schema.Any as Schema.Schema<
					WriteRow & { id: typeof MerchantId.Type }
				>,
				Result: MerchantFromRow,
				execute: (row) =>
					sql`UPDATE merchants SET ${sql.update(row, ["id"])} WHERE id = ${row.id} RETURNING *`,
			});

			// One hoisted query for both `setImage` and `clearImage` — a `string`
			// sets the column, `null` clears it. Keeps the `RETURNING *` + decode
			// shape in a single place (the other writes are hoisted too).
			const setImageUrlQuery = SqlSchema.single({
				Request: Schema.Any as Schema.Schema<{
					id: typeof MerchantId.Type;
					imageUrl: string | null;
				}>,
				Result: MerchantFromRow,
				execute: ({ id, imageUrl }) =>
					sql`UPDATE merchants SET imageUrl = ${imageUrl} WHERE id = ${id} RETURNING *`,
			});

			const nowIso = Clock.currentTimeMillis.pipe(
				Effect.map((millis) => new Date(millis).toISOString()),
			);

			/** Unwrap a lookup's `Option`, 404-ing when absent (the key goes on the error). */
			const requireOne = (
				found: Option.Option<Merchant>,
				key: string | number,
			): Effect.Effect<Merchant, NotFound> =>
				Option.match(found, {
					onNone: () =>
						Effect.fail(new NotFound({ resource: "merchant", id: key })),
					onSome: Effect.succeed,
				});

			/** Fold an entity into a plain, null-mapped write row (drops `id`). */
			const toWriteRow = (m: Merchant): WriteRow => ({
				name: m.name,
				imageUrl: m.imageUrl ?? null,
				defaultCategoryId: m.defaultCategoryId ?? null,
				createdAt: m.createdAt.toISOString(),
				firstSeen: m.firstSeen.toISOString(),
			});

			const list = (filter: ListFilter) =>
				Effect.all({
					items: listQuery(filter),
					total: countQuery().pipe(Effect.map((r) => r.count)),
				}).pipe(
					Effect.map((paged) => PagedMerchant.make(paged)),
					orDieSql,
				);

			const getById = (id: typeof MerchantId.Type) =>
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

			const create = (payload: MerchantCreate) =>
				nowIso.pipe(
					Effect.flatMap((now) =>
						insertQuery({
							name: payload.name,
							imageUrl: payload.imageUrl ?? null,
							defaultCategoryId: payload.defaultCategoryId ?? null,
							createdAt: now,
							firstSeen: payload.firstSeen.toISOString(),
						}),
					),
					orDieSql,
				);

			const update = (id: typeof MerchantId.Type, changes: MerchantUpdate) =>
				getById(id).pipe(
					// getById already 404s if missing; the write then always hits a row.
					Effect.flatMap((current) =>
						updateQuery({
							id,
							...toWriteRow(new Merchant({ ...current, ...changes })),
						}).pipe(orDieSql),
					),
				);

			/**
			 * Set the `imageUrl` column (used by `uploadImage`). Distinct from
			 * `update` because a partial update can't distinguish "leave imageUrl
			 * unchanged" from "set it" — this always writes the column. Returns the
			 * updated `Merchant`; the caller has already fetched it (404 handled).
			 */
			const setImage = (id: typeof MerchantId.Type, imageUrl: string) =>
				setImageUrlQuery({ id, imageUrl }).pipe(orDieSql);

			/**
			 * Clear the `imageUrl` column to NULL (used by `deleteImage`). A partial
			 * `update({ imageUrl: undefined })` means "no change", so clearing needs
			 * this explicit write. Returns the updated `Merchant` (`imageUrl` absent).
			 */
			const clearImage = (id: typeof MerchantId.Type) =>
				setImageUrlQuery({ id, imageUrl: null }).pipe(orDieSql);

			const remove = (id: typeof MerchantId.Type) =>
				getById(id).pipe(
					Effect.flatMap(() =>
						orDieSql(sql`DELETE FROM merchants WHERE id = ${id}`),
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
	},
) {}

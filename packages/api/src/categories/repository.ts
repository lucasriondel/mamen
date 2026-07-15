import { SqlClient, SqlSchema } from "@effect/sql";
import {
	Category,
	type CategoryCreate,
	CategoryId,
	CategoryParentNotFolder,
	type CategoryUpdate,
	NotFound,
	Paged,
} from "@mamen/shared/contract";
import { Clock, Effect, Option, Schema } from "effect";
import { orDieSql } from "../db/errors";

/** Row shape as stored in sqlite — `createdAt` is ISO-8601 TEXT. */
const CategoryRow = Schema.Struct({
	id: Schema.Number,
	name: Schema.String,
	slug: Schema.String,
	color: Schema.String,
	icon: Schema.String,
	parentId: Schema.NullOr(Schema.Number),
	sortOrder: Schema.Number,
	createdAt: Schema.String,
});

const PagedCategory = Paged(Category);

/** Number of rows in a `count(*)` result. */
const CountResult = Schema.Struct({ count: Schema.Number });

/** The composable `list` filter, decoded from the query string (both optional). */
type ListFilter = {
	limit: number;
	offset: number;
	parentId?: typeof CategoryId.Type;
	orderBy?: "sortOrder";
};

/**
 * The category repository, on `@effect/sql`. Depends only on the generic
 * `SqlClient.SqlClient` tag, so it runs unchanged against the Bun prod client
 * and the `:memory:` sqlite-node test client. Typed `NotFound` on the by-id /
 * by-slug lookups; `slug` has no uniqueness constraint (faithful port), so
 * writes collapse a `SqlError` to a 500 defect ({@link orDieSql}) — no
 * `Conflict`.
 */
export class CategoryRepo extends Effect.Service<CategoryRepo>()(
	"api/CategoryRepo",
	{
		effect: Effect.gen(function* () {
			const sql = yield* SqlClient.SqlClient;

			// The composable filter (contract §2.3): `parentId` scopes to a
			// parent's children, `orderBy: "sortOrder"` orders by sortOrder (else
			// insertion order / `id`). Both independent and combinable — the
			// fragment is empty when neither is set, replacing the old fan-out.
			const whereClause = (parentId: number | undefined) =>
				parentId === undefined
					? sql``
					: sql`WHERE parentId = ${parentId}`;

			const orderClause = (orderBy: "sortOrder" | undefined) =>
				orderBy === "sortOrder" ? sql`ORDER BY sortOrder ASC` : sql`ORDER BY id`;

			// `Request: Schema.Any` skips a redundant re-decode: the filter is
			// already decoded + branded at the HTTP boundary (`CategoryListFilters`
			// via `numFromStr(CategoryId)` + `Schema.Literal`), and the params bind
			// through the `sql` fragments below, not the Request schema. A
			// `Schema.Struct` Request can't co-exist with the dynamic where/order
			// fragment interpolation, so the cast is the idiomatic escape hatch.
			const listQuery = SqlSchema.findAll({
				Request: Schema.Any as Schema.Schema<ListFilter>,
				Result: Category,
				execute: ({ limit, offset, parentId, orderBy }) =>
					sql`SELECT * FROM categories ${whereClause(parentId)} ${orderClause(orderBy)} LIMIT ${limit} OFFSET ${offset}`,
			});

			const countQuery = SqlSchema.single({
				Request: Schema.Any as Schema.Schema<{ parentId?: number }>,
				Result: CountResult,
				execute: ({ parentId }) =>
					sql`SELECT COUNT(*) AS count FROM categories ${whereClause(parentId)}`,
			});

			const byIdQuery = SqlSchema.findOne({
				Request: CategoryId,
				Result: Category,
				execute: (id) => sql`SELECT * FROM categories WHERE id = ${id}`,
			});

			const bySlugQuery = SqlSchema.findOne({
				Request: Schema.String,
				Result: Category,
				execute: (slug) => sql`SELECT * FROM categories WHERE slug = ${slug}`,
			});

			// One indexed lookup of a would-be parent's own `parentId` — the
			// folder/leaf test for the two-level invariant (ADR 0001, rule 1). A
			// `null` parentId means the parent is a folder (a legal home for a
			// leaf); a non-null one means the parent is itself a leaf, so a child
			// hung under it would sit at depth 3. Mirrors the transactions guard.
			const parentOfQuery = SqlSchema.findOne({
				Request: Schema.Number,
				Result: Schema.Struct({ parentId: Schema.NullOr(Schema.Number) }),
				execute: (id) => sql`SELECT parentId FROM categories WHERE id = ${id}`,
			});

			// The non-folders among a set of would-be parent ids — the batch depth
			// test a bulk payload runs in **one** query, not one per row (ADR 0001).
			// Any id it returns already has a parent, so a child hung under it would
			// sit at depth 3; an empty result means every parent is a folder or
			// unknown.
			const leavesInQuery = SqlSchema.findAll({
				Request: Schema.Any as Schema.Schema<ReadonlyArray<number>>,
				Result: Schema.Struct({ id: Schema.Number }),
				execute: (ids) =>
					sql`SELECT id FROM categories WHERE parentId IS NOT NULL AND ${sql.in("id", ids)}`,
			});

			/**
			 * The two-level invariant (ADR 0001, rule 1) at the categories door: a
			 * new category's `parentId` must point at a **folder** (a root, no
			 * parent), never at a **leaf**. A `null` parentId (creating a folder)
			 * skips the check; an unknown id is left to pass (no FK exists — policing
			 * missing rows is not this invariant's job).
			 */
			const assertParentIsFolder = (
				parentId: number | null | undefined,
			): Effect.Effect<void, CategoryParentNotFolder> =>
				parentId == null
					? Effect.void
					: parentOfQuery(parentId).pipe(
							orDieSql,
							Effect.flatMap((found) =>
								Option.match(found, {
									onNone: () => Effect.void,
									onSome: (row) =>
										row.parentId === null
											? Effect.void
											: Effect.fail(new CategoryParentNotFolder({ parentId })),
								}),
							),
						);

			// Batch guard for a bulk payload: resolve every distinct parentId's
			// leaf/folder status in **one** query (ADR 0001), failing on the first
			// leaf found. An empty id set (every row is a folder) touches no DB.
			const assertAllParentsAreFolders = (
				records: ReadonlyArray<CategoryCreate>,
			): Effect.Effect<void, CategoryParentNotFolder> => {
				const ids = [
					...new Set(
						records.flatMap((r) => (r.parentId != null ? [r.parentId] : [])),
					),
				];
				return ids.length === 0
					? Effect.void
					: leavesInQuery(ids).pipe(
							orDieSql,
							Effect.flatMap((rows) => {
								const leaf = rows[0];
								return leaf === undefined
									? Effect.void
									: Effect.fail(
											new CategoryParentNotFolder({ parentId: leaf.id }),
										);
							}),
						);
			};

			const CategoryInsert = CategoryRow.pipe(Schema.omit("id"));

			const insertQuery = SqlSchema.single({
				Request: CategoryInsert,
				Result: Category,
				execute: (row) =>
					sql`INSERT INTO categories ${sql.insert(row)} RETURNING *`,
			});

			const updateQuery = SqlSchema.single({
				Request: Category,
				Result: Category,
				execute: (row) =>
					sql`UPDATE categories SET ${sql.update(row, ["id"])} WHERE id = ${row.id} RETURNING *`,
			});

			const nowIso = Clock.currentTimeMillis.pipe(
				Effect.map((millis) => new Date(millis).toISOString()),
			);

			/** Unwrap a lookup's `Option`, 404-ing when absent (the key goes on the error). */
			const requireOne = (
				found: Option.Option<Category>,
				key: string | number,
			): Effect.Effect<Category, NotFound> =>
				Option.match(found, {
					onNone: () =>
						Effect.fail(new NotFound({ resource: "category", id: key })),
					onSome: Effect.succeed,
				});

			const list = (filter: ListFilter) =>
				Effect.all({
					items: listQuery(filter),
					total: countQuery({ parentId: filter.parentId }).pipe(
						Effect.map((r) => r.count),
					),
				}).pipe(
					Effect.map((paged) => PagedCategory.make(paged)),
					orDieSql,
				);

			const getById = (id: typeof CategoryId.Type) =>
				byIdQuery(id).pipe(
					orDieSql,
					Effect.flatMap((found) => requireOne(found, id)),
				);

			const getBySlug = (slug: string) =>
				bySlugQuery(slug).pipe(
					orDieSql,
					Effect.flatMap((found) => requireOne(found, slug)),
				);

			/** The stored row for a create payload, stamped with `createdAt`. */
			const toInsertRow = (payload: CategoryCreate, now: string) => ({
				name: payload.name,
				slug: payload.slug,
				color: payload.color,
				icon: payload.icon,
				parentId: payload.parentId,
				sortOrder: payload.sortOrder,
				createdAt: now,
			});

			const create = (payload: CategoryCreate) =>
				assertParentIsFolder(payload.parentId).pipe(
					Effect.andThen(
						nowIso.pipe(
							Effect.flatMap((now) => insertQuery(toInsertRow(payload, now))),
							orDieSql,
						),
					),
				);

			/**
			 * Insert every record, returning the created rows with their generated
			 * ids (201). Each row shares the one `now` timestamp. An empty `records`
			 * array yields `[]` — no statement runs.
			 */
			const bulkCreate = (records: ReadonlyArray<CategoryCreate>) =>
				assertAllParentsAreFolders(records).pipe(
					Effect.andThen(
						nowIso.pipe(
							Effect.flatMap((now) =>
								Effect.forEach(records, (payload) =>
									insertQuery(toInsertRow(payload, now)),
								),
							),
							orDieSql,
						),
					),
				);

			const update = (id: typeof CategoryId.Type, changes: CategoryUpdate) =>
				getById(id).pipe(
					// getById already 404s if missing; the write then always hits a row.
					Effect.flatMap((current) =>
						updateQuery(
							new Category({ ...current, ...changes }),
						).pipe(orDieSql),
					),
				);

			const remove = (id: typeof CategoryId.Type) =>
				getById(id).pipe(
					Effect.flatMap(() =>
						orDieSql(sql`DELETE FROM categories WHERE id = ${id}`),
					),
					Effect.asVoid,
				);

			return {
				list,
				getById,
				getBySlug,
				create,
				bulkCreate,
				update,
				remove,
			} as const;
		}),
	},
) {}

import { SqlClient, SqlSchema } from "@effect/sql";
import {
	Category,
	type CategoryCreate,
	CategoryHoldsMoney,
	CategoryId,
	CategoryInUse,
	type CategorySpill,
	type CategoryUpdate,
	CategoryWouldCycle,
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
				parentId === undefined ? sql`` : sql`WHERE parentId = ${parentId}`;

			const orderClause = (orderBy: "sortOrder" | undefined) =>
				orderBy === "sortOrder"
					? sql`ORDER BY sortOrder ASC`
					: sql`ORDER BY id`;

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

			// The three dependency counts the guarded delete consults (ADR 0001).
			// Each is one indexed count; together they name what still depends on a
			// category so the refusal can tell the caller what to re-assign first.
			// `children` — leaves under a folder; `transactions` — override rows
			// pointing at a leaf (a *manual* category, the only kind the derivation
			// reads; a stale non-manual `categoryId` is not a live assignment);
			// `issuers` — a leaf held as an Issuer default category.
			const childCountQuery = SqlSchema.single({
				Request: Schema.Number,
				Result: CountResult,
				execute: (id) =>
					sql`SELECT COUNT(*) AS count FROM categories WHERE parentId = ${id}`,
			});

			const txRefCountQuery = SqlSchema.single({
				Request: Schema.Number,
				Result: CountResult,
				execute: (id) =>
					sql`SELECT COUNT(*) AS count FROM transactions WHERE categoryId = ${id} AND manualCategory = 1`,
			});

			const issuerRefCountQuery = SqlSchema.single({
				Request: Schema.Number,
				Result: CountResult,
				execute: (id) =>
					sql`SELECT COUNT(*) AS count FROM issuers WHERE defaultCategoryId = ${id}`,
			});

			// One hop up the tree: a node's `parentId` (or `null` at a root, `None`
			// if the id is unknown). The cycle guard walks this repeatedly on
			// `idx_categories_parentId`'s covered lookup to climb from a proposed new
			// parent toward the root.
			const parentOfQuery = SqlSchema.findOne({
				Request: Schema.Number,
				Result: Schema.Struct({ parentId: Schema.NullOr(Schema.Number) }),
				execute: (id) => sql`SELECT parentId FROM categories WHERE id = ${id}`,
			});

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

			/**
			 * The **cycle guard** (ADR 0003, issue #31): a re-parent may not make a
			 * node its own **ancestor**. The two-level tree made cycles impossible by
			 * construction — a folder had no parent, so nothing could point back at it
			 * — but unbounded depth removes that accident, and a cycle is not cosmetic:
			 * a category orphaned into a ring vanishes from the tree entirely and the
			 * recursive rollup walks it forever. Walk up from the proposed new parent
			 * and refuse on reaching `id`, the node being moved. Refusing a node's own
			 * descendant covers the **self-parent** case for free (a node is its own
			 * trivial ancestor), so both fall out of one check. A `null`/`undefined`
			 * parent (clearing / no change) cannot cycle. The walk terminates: the
			 * pre-write tree has no cycles (this guard is why), so it climbs to a root's
			 * `null`; a genuine cycle short-circuits the moment the cursor reaches `id`
			 * — so a grandparent moved under its own grandchild is refused, not hung.
			 */
			const assertNoCycle = (
				id: number,
				parentId: number | null | undefined,
			): Effect.Effect<void, CategoryWouldCycle> =>
				parentId == null
					? Effect.void
					: Effect.iterate(parentId as number | null, {
							while: (cursor) => cursor !== null && cursor !== id,
							body: (cursor) =>
								parentOfQuery(cursor as number).pipe(
									orDieSql,
									Effect.map(
										Option.match({
											onNone: () => null,
											onSome: (r) => r.parentId,
										}),
									),
								),
						}).pipe(
							Effect.flatMap((reached) =>
								reached === id
									? Effect.fail(
											new CategoryWouldCycle({ categoryId: id, parentId }),
										)
									: Effect.void,
							),
						);

			/**
			 * The **Kind flip** guard (ADR 0003, issue #30): a leaf gaining its first
			 * child turns into a folder, but a folder is a rollup node the total visits
			 * without counting its own rows — so a would-be parent that still holds
			 * money must not take a child. Runs the two money counts the guarded delete
			 * already uses — *manual* transaction overrides pointing at the node and
			 * issuers holding it as a default (a derived category hangs a whole issuer's
			 * history off the node invisibly) — and fails {@link CategoryHoldsMoney}
			 * with both counts if either is non-zero. A `null`/`undefined` parent (no
			 * flip) or a childless-but-empty parent passes. The categories page answers
			 * the refusal by offering to **Spill** those transactions into a new child.
			 */
			const assertParentTakesNoMoney = (
				parentId: number | null | undefined,
			): Effect.Effect<void, CategoryHoldsMoney> =>
				parentId == null
					? Effect.void
					: Effect.all({
							transactions: txRefCountQuery(parentId).pipe(
								Effect.map((r) => r.count),
							),
							issuers: issuerRefCountQuery(parentId).pipe(
								Effect.map((r) => r.count),
							),
						}).pipe(
							orDieSql,
							Effect.flatMap(({ transactions, issuers }) =>
								transactions + issuers > 0
									? Effect.fail(
											new CategoryHoldsMoney({
												categoryId: parentId,
												transactions,
												issuers,
											}),
										)
									: Effect.void,
							),
						);

			/**
			 * The **Guarded delete** (ADR 0001): refuse while anything still depends on
			 * the category. Runs the three dependency counts in one pass; if any is
			 * non-zero, fails with {@link CategoryInUse} carrying every count, so the
			 * refusal can name each dependent kind. Neither cascading nor nulling is
			 * offered — both silently drop money out of totals.
			 */
			const assertNoDependents = (
				id: number,
			): Effect.Effect<void, CategoryInUse> =>
				Effect.all({
					children: childCountQuery(id).pipe(Effect.map((r) => r.count)),
					transactions: txRefCountQuery(id).pipe(Effect.map((r) => r.count)),
					issuers: issuerRefCountQuery(id).pipe(Effect.map((r) => r.count)),
				}).pipe(
					orDieSql,
					Effect.flatMap(({ children, transactions, issuers }) =>
						children + transactions + issuers > 0
							? Effect.fail(
									new CategoryInUse({
										categoryId: id,
										children,
										transactions,
										issuers,
									}),
								)
							: Effect.void,
					),
				);

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

			// Any node — leaf or folder — is a legal home (ADR 0003): adding a child
			// simply turns its parent into a folder. The one guard is the Kind flip
			// (issue #30): a would-be parent still holding money may not take a child
			// until that money is spilled into a new leaf.
			const create = (payload: CategoryCreate) =>
				assertParentTakesNoMoney(payload.parentId).pipe(
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
			 * array yields `[]` — no statement runs. Any depth is legal (ADR 0003);
			 * the one guard is the Kind flip (issue #30) — every row's parent is
			 * checked first, so a batch cannot slip a child under a money-holding leaf.
			 */
			const bulkCreate = (records: ReadonlyArray<CategoryCreate>) =>
				Effect.forEach(records, (payload) =>
					assertParentTakesNoMoney(payload.parentId),
				).pipe(
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
						// Two re-parent guards (ADR 0003): the move may not make the node
						// its own ancestor — a cycle (`assertNoCycle`, issue #31) — and the
						// new parent may not still hold money — a Kind flip that would
						// strand it (`assertParentTakesNoMoney`, issue #30). Any node is a
						// legal parent at any depth now (the old "new parent must be a
						// folder" and "a folder with children may not be re-homed" checks
						// are both gone), so re-parenting a whole subtree is legal; only a
						// cycle or stranded money is refused.
						assertNoCycle(id, changes.parentId).pipe(
							Effect.andThen(assertParentTakesNoMoney(changes.parentId)),
							Effect.andThen(
								updateQuery(new Category({ ...current, ...changes })).pipe(
									orDieSql,
								),
							),
						),
					),
				);

			/**
			 * **Spill** (ADR 0003, issue #30): the atomic answer to a refused Kind
			 * flip. Create a new child leaf under `id` and move the node's money into
			 * it in one `withTransaction` — the insert, the manual-override re-point,
			 * and the issuer-default re-point commit together, so there is never a state
			 * where the child exists but the money did not move. Bypasses the
			 * money-holding guard on purpose: it *is* the sanctioned flip, and it clears
			 * the money as it makes the child. 404s (via `getById`) if the node is gone.
			 * The user names the destination; nothing is auto-named.
			 */
			const spill = (
				id: typeof CategoryId.Type,
				payload: CategorySpill,
			): Effect.Effect<Category, NotFound> =>
				getById(id).pipe(
					Effect.andThen(nowIso),
					Effect.flatMap((now) =>
						sql
							.withTransaction(
								insertQuery(
									toInsertRow({ ...payload, parentId: id }, now),
								).pipe(
									Effect.tap((leaf) =>
										Effect.all(
											[
												// Manual override rows on the node → the new leaf (still a
												// manual pick, only the target moves).
												sql`UPDATE transactions SET categoryId = ${leaf.id} WHERE categoryId = ${id} AND manualCategory = 1`,
												// Issuers holding the node as their default → the new leaf,
												// carrying the whole derived history with them.
												sql`UPDATE issuers SET defaultCategoryId = ${leaf.id} WHERE defaultCategoryId = ${id}`,
											],
											{ discard: true },
										),
									),
								),
							)
							.pipe(orDieSql),
					),
				);

			const remove = (id: typeof CategoryId.Type) =>
				getById(id).pipe(
					// getById 404s if missing; then the guarded delete refuses while
					// anything still depends on the category (ADR 0001).
					Effect.andThen(assertNoDependents(id)),
					Effect.andThen(
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
				spill,
				remove,
			} as const;
		}),
	},
) {}

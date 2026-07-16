import {
	HttpApiEndpoint,
	HttpApiGroup,
	HttpApiSchema,
	OpenApi,
} from "@effect/platform";
import { Schema } from "effect";
import {
	CategoryHasChildren,
	CategoryHoldsMoney,
	CategoryInUse,
	NotFound,
} from "./errors";
import { CategoryId, numFromStr } from "./ids";
import { Paged, Pagination } from "./pagination";

/** Category entity — the wire shape returned by every categories endpoint. */
export class Category extends Schema.Class<Category>("Category")({
	id: CategoryId,
	name: Schema.String,
	slug: Schema.String,
	color: Schema.String,
	icon: Schema.String,
	parentId: Schema.NullOr(CategoryId), // null = root
	sortOrder: Schema.Number,
	createdAt: Schema.Date,
}) {}

/** Create payload — the server assigns `id` and `createdAt`. */
export const CategoryCreate = Schema.Struct({
	name: Category.fields.name,
	slug: Category.fields.slug,
	color: Category.fields.color,
	icon: Category.fields.icon,
	parentId: Category.fields.parentId,
	sortOrder: Category.fields.sortOrder,
});
export type CategoryCreate = typeof CategoryCreate.Type;

/** Update payload — every field optional (partial update). */
export const CategoryUpdate = Schema.partial(CategoryCreate);
export type CategoryUpdate = typeof CategoryUpdate.Type;

/** Bulk-create payload — `{ records }`, one row created per element (201). */
export const CategoryBulkCreate = Schema.Struct({
	records: Schema.Array(CategoryCreate),
});
export type CategoryBulkCreate = typeof CategoryBulkCreate.Type;

/**
 * **Spill** payload — the fields of the new child **Category leaf** the money
 * lands in; its parent is the path id, so `parentId` is not carried. The user
 * always names the destination (an auto-named leaf is a guess about intent that
 * then lives in their tree forever), which is why `name`/`slug` are required
 * rather than derived server-side. See {@link CategoriesGroup}'s `spill`.
 */
export const CategorySpill = Schema.Struct({
	name: Category.fields.name,
	slug: Category.fields.slug,
	color: Category.fields.color,
	icon: Category.fields.icon,
	sortOrder: Category.fields.sortOrder,
});
export type CategorySpill = typeof CategorySpill.Type;

/**
 * `list` filters (contract §2.3), composable — both optional and `AND`-combined,
 * replacing the old branch-1..4 fan-out (root / by-parent / ordered / both).
 * `parentId` filters to a parent's children; `orderBy: "sortOrder"` orders by
 * `sortOrder` (else natural/insertion order). Spread alongside `Pagination`.
 */
export const CategoryListFilters = {
	parentId: Schema.optional(numFromStr(CategoryId)),
	orderBy: Schema.optional(Schema.Literal("sortOrder")),
} as const;

/**
 * Categories group (contract §2.3), prefix `/categories`. `slug` has no DB
 * uniqueness constraint (faithful port), so no endpoint declares `Conflict`.
 * Categories nest to **any depth** (ADR 0003): any node may be a parent, so
 * `create`/`bulkCreate` declare no depth guard — a leaf parent is a legal home
 * now that a child simply turns it into a folder. They do declare
 * `CategoryHoldsMoney` (422): a **Kind flip** is refused while the would-be
 * parent still holds money (transactions or an issuer default), so the money is
 * not stranded off a rollup node. `update` declares the same, plus
 * `CategoryHasChildren` (422): a folder that still has children may not be given
 * a parent (the remaining moved-node guard). `remove` declares `CategoryInUse`
 * (409): the **Guarded delete**, refused while a folder has children or a leaf is
 * still assigned to transactions or held as an issuer default.
 *
 * `spill` (POST `/categories/:id/spill`) answers a refused Kind flip: it creates
 * a new child **Category leaf** under the node and moves the node's money into it
 * — *manual* override transactions and issuers holding it as a default — in one
 * atomic transaction, so the node becomes a folder and its money keeps a home
 * with no half-done tree. 404s if the node is missing; 201 with the new leaf.
 *
 * `getById`/`getBySlug`/`update`/`remove` 404 on a missing key. Dropped vs today:
 * `GET /categories/root`, `PUT /categories/bulk-put`, `POST /categories/clear`
 * (all client-only).
 */
export class CategoriesGroup extends HttpApiGroup.make("categories")
	.add(
		HttpApiEndpoint.get("list")`/categories`
			.setUrlParams(Schema.Struct({ ...Pagination, ...CategoryListFilters }))
			.addSuccess(Paged(Category)),
	)
	.add(
		HttpApiEndpoint.get(
			"getById",
		)`/categories/${HttpApiSchema.param("id", numFromStr(CategoryId))}`
			.addSuccess(Category)
			.addError(NotFound),
	)
	.add(
		HttpApiEndpoint.get(
			"getBySlug",
		)`/categories/by-slug/${HttpApiSchema.param("slug", Schema.String)}`
			.addSuccess(Category)
			.addError(NotFound),
	)
	.add(
		HttpApiEndpoint.post("create")`/categories`
			.setPayload(CategoryCreate)
			.addSuccess(Category, { status: 201 })
			.addError(CategoryHoldsMoney),
	)
	.add(
		HttpApiEndpoint.post("bulkCreate")`/categories/bulk-add`
			.setPayload(CategoryBulkCreate)
			.addSuccess(Schema.Array(Category), { status: 201 })
			.addError(CategoryHoldsMoney),
	)
	.add(
		HttpApiEndpoint.put(
			"update",
		)`/categories/${HttpApiSchema.param("id", numFromStr(CategoryId))}`
			.setPayload(CategoryUpdate)
			.addSuccess(Category)
			.addError(NotFound)
			.addError(CategoryHasChildren)
			.addError(CategoryHoldsMoney),
	)
	.add(
		HttpApiEndpoint.post(
			"spill",
		)`/categories/${HttpApiSchema.param("id", numFromStr(CategoryId))}/spill`
			.setPayload(CategorySpill)
			.addSuccess(Category, { status: 201 })
			.addError(NotFound),
	)
	.add(
		HttpApiEndpoint.del(
			"remove",
		)`/categories/${HttpApiSchema.param("id", numFromStr(CategoryId))}`
			.addSuccess(HttpApiSchema.NoContent)
			.addError(NotFound)
			.addError(CategoryInUse),
	)
	.annotateContext(OpenApi.annotations({ title: "Categories" })) {}

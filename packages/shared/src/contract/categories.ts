import {
	HttpApiEndpoint,
	HttpApiGroup,
	HttpApiSchema,
	OpenApi,
} from "@effect/platform";
import { Schema } from "effect";
import { NotFound } from "./errors";
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
 * uniqueness constraint (faithful port), so `create`/`bulkCreate`/`update`
 * declare no `Conflict`. `getById`/`getBySlug`/`update`/`remove` 404 on a
 * missing key. Dropped vs today: `GET /categories/root`, `PUT
 * /categories/bulk-put`, `POST /categories/clear` (all client-only).
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
			.addSuccess(Category, { status: 201 }),
	)
	.add(
		HttpApiEndpoint.post("bulkCreate")`/categories/bulk-add`
			.setPayload(CategoryBulkCreate)
			.addSuccess(Schema.Array(Category), { status: 201 }),
	)
	.add(
		HttpApiEndpoint.put(
			"update",
		)`/categories/${HttpApiSchema.param("id", numFromStr(CategoryId))}`
			.setPayload(CategoryUpdate)
			.addSuccess(Category)
			.addError(NotFound),
	)
	.add(
		HttpApiEndpoint.del(
			"remove",
		)`/categories/${HttpApiSchema.param("id", numFromStr(CategoryId))}`
			.addSuccess(HttpApiSchema.NoContent)
			.addError(NotFound),
	)
	.annotateContext(OpenApi.annotations({ title: "Categories" })) {}

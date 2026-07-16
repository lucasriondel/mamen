import { HttpApiSchema } from "@effect/platform";
import { Schema } from "effect";

/**
 * The domain error set for the whole contract. Each is a `Schema.TaggedError`
 * with a fixed HTTP status (via `HttpApiSchema.annotations`); the wire body is
 * its fields plus the `_tag` discriminant. Endpoints declare only the errors
 * they can actually produce via `.addError(...)`. The framework's
 * `HttpApiDecodeError (400)` and an untyped `500` are implicit on every
 * endpoint and are NOT part of this set.
 */

/** A row addressed by id / name / slug / key is missing (get, update, delete). */
export class NotFound extends Schema.TaggedError<NotFound>()(
	"NotFound",
	{
		resource: Schema.String,
		id: Schema.Union(Schema.String, Schema.Number),
	},
	HttpApiSchema.annotations({ status: 404 }),
) {}

/** A uniqueness constraint was violated (e.g. duplicate settings key). */
export class Conflict extends Schema.TaggedError<Conflict>()(
	"Conflict",
	{
		resource: Schema.String,
		message: Schema.String,
	},
	HttpApiSchema.annotations({ status: 409 }),
) {}

/**
 * A category that must be an assignable **leaf** was supplied as a **folder**
 * (a category that **has children**). Enforces the **Leaf-assignable invariant**
 * at the API boundary (ADR 0003): a category is assignable iff it has no
 * children, at *any* depth — so this fires for a node with children regardless of
 * where it sits, not for a root. A folder held as `issuer.defaultCategoryId` or
 * as a `transaction.categoryId` hangs money off a node the category rollup visits
 * but never counts, understating the total with no error on screen. `categoryId`
 * names the offending folder so the caller can pick one of its leaves instead.
 *
 * The name is kept while its meaning inverts: it once flagged a **root** (used as
 * a proxy for "not a leaf"), which under nesting silently admitted mid-tier
 * folders as assignable — see ADR 0003.
 */
export class CategoryNotLeaf extends Schema.TaggedError<CategoryNotLeaf>()(
	"CategoryNotLeaf",
	{
		categoryId: Schema.Number,
	},
	HttpApiSchema.annotations({ status: 422 }),
) {}

/**
 * A category being moved is a **folder that still has children**, and the update
 * would give it a parent. The remaining moved-node `update` guard that survives
 * from ADR 0001 into the **Leaf-assignable invariant** (ADR 0003): a childless
 * node is a legal home under any parent — depth is no longer capped — but a
 * folder with children may not itself be given a parent. `categoryId` names the
 * folder so the caller can empty or re-home its children first.
 */
export class CategoryHasChildren extends Schema.TaggedError<CategoryHasChildren>()(
	"CategoryHasChildren",
	{
		categoryId: Schema.Number,
	},
	HttpApiSchema.annotations({ status: 422 }),
) {}

/**
 * A **Kind flip** was refused because it would **strand money**. Adding a child
 * to a **Category leaf** turns it into a **Category folder** (ADR 0003), but a
 * folder is a rollup node the total visits without counting its own rows — so a
 * leaf that still holds money cannot take a child until that money is moved.
 * Fires on `create`/`bulkCreate`/`update` whenever the given `parentId` points at
 * a node that holds money: `transactions` (rows carrying it as a **Category
 * override**) plus `issuers` (holding it as an **Issuer default category** — a
 * derived category hangs a whole issuer's history off the node invisibly, so
 * counting only directly-assigned rows would miss the common case). At least one
 * is non-zero; `categoryId` names the would-be parent. The categories page
 * answers the refusal by offering to **Spill** — move those transactions into a
 * new child leaf the user names — so the money keeps a home. Mirrors the
 * guarded-delete ergonomics ({@link CategoryInUse}).
 */
export class CategoryHoldsMoney extends Schema.TaggedError<CategoryHoldsMoney>()(
	"CategoryHoldsMoney",
	{
		categoryId: Schema.Number,
		transactions: Schema.Number,
		issuers: Schema.Number,
	},
	HttpApiSchema.annotations({ status: 422 }),
) {}

/**
 * A category cannot be deleted because something still **depends on it** — the
 * **Guarded delete** (ADR 0001). The refusal names each kind of dependent by
 * count so the caller can go re-assign first: `children` (a **Category folder**
 * still holding leaves), `transactions` (a **Category leaf** still carrying
 * overrides that point at it), and `issuers` (a leaf still held as an **Issuer
 * default category**). At least one is non-zero. Neither cascading the delete nor
 * nulling the references is acceptable: both silently drop money out of every
 * total — the exact failure the two-level invariant exists to prevent, arriving
 * through a different door. Mirrors the guarded delete already used for issuers.
 */
export class CategoryInUse extends Schema.TaggedError<CategoryInUse>()(
	"CategoryInUse",
	{
		categoryId: Schema.Number,
		children: Schema.Number,
		transactions: Schema.Number,
		issuers: Schema.Number,
	},
	HttpApiSchema.annotations({ status: 409 }),
) {}

/** An upload's MIME type is not in the image allow-list. */
export class InvalidFileType extends Schema.TaggedError<InvalidFileType>()(
	"InvalidFileType",
	{
		allowed: Schema.Array(Schema.String),
		received: Schema.String,
	},
	HttpApiSchema.annotations({ status: 415 }),
) {}

/**
 * Decodes a query-string boolean ("true" / "false") into a real boolean. Query
 * params are always strings, so boolean list filters (e.g. `isRefund`) use this.
 */
export const BooleanFromString = Schema.transform(
	Schema.Literal("true", "false"),
	Schema.Boolean,
	{
		strict: true,
		decode: (s) => s === "true",
		encode: (b) => (b ? "true" : "false"),
	},
);

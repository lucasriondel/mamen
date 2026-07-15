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
 * (a category with no parent). Enforces the two-level invariant at the API
 * boundary (ADR 0001): a folder held as `issuer.defaultCategoryId` or as a
 * `transaction.categoryId` hangs money off a node the category rollup visits
 * but never counts, understating the total with no error on screen. `categoryId`
 * names the offending folder so the caller can pick one of its leaves instead.
 */
export class CategoryNotLeaf extends Schema.TaggedError<CategoryNotLeaf>()(
	"CategoryNotLeaf",
	{
		categoryId: Schema.Number,
	},
	HttpApiSchema.annotations({ status: 422 }),
) {}

/**
 * A new category's `parentId` points at a category that itself has a parent —
 * a **leaf**, not a **folder**. Enforces the other half of the two-level
 * invariant at the API boundary (ADR 0001, rule 1): a category nested three deep
 * hangs transactions off a node the folder rollup never visits, understating the
 * total with no error on screen. `parentId` names the offending leaf so the
 * caller can re-parent under one of the folders instead.
 */
export class CategoryParentNotFolder extends Schema.TaggedError<CategoryParentNotFolder>()(
	"CategoryParentNotFolder",
	{
		parentId: Schema.Number,
	},
	HttpApiSchema.annotations({ status: 422 }),
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

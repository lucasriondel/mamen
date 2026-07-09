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

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
 * A **re-parent** was refused because it would make a category its own
 * **ancestor** — a cycle. Unbounded depth (ADR 0003) removes the accident that
 * made cycles impossible in the two-level tree (a folder had no parent, so
 * nothing could point back at it), so re-parenting must walk up from the proposed
 * new parent and refuse if the walk reaches the node being moved. A cycle is not
 * cosmetic: a category orphaned into a ring vanishes from the tree entirely and
 * the recursive rollup walks it forever. Refusing a node's own descendant covers
 * the **self-parent** case for free (a node is its own trivial ancestor), so both
 * fall out of one check. `categoryId` names the node being moved; `parentId` the
 * proposed parent that sits at or below it.
 */
export class CategoryWouldCycle extends Schema.TaggedError<CategoryWouldCycle>()(
	"CategoryWouldCycle",
	{
		categoryId: Schema.Number,
		parentId: Schema.Number,
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

/**
 * A set of transactions could not be grouped as one **internal transfer**
 * (PRD #48). Raised only by `link-transfer`, which validates the set atomically
 * server-side — the multi-row invariants the generic single-row update
 * structurally cannot enforce. A dedicated error rather than an overloaded
 * `NotFound`, so the client can tell "a leg is missing" from "the legs don't
 * balance". `reason` is the machine-readable cause:
 *
 * - `too-few-legs` — a transfer needs ≥2 distinct legs.
 * - `unbalanced` — the legs' signed amounts don't sum to zero (compared in
 *   integer cents — amounts are float euros, never compared as floats).
 * - `unknown-id` — some id in the set doesn't exist.
 * - `already-grouped` — some leg already carries a `transferGroupId` (a leg can
 *   belong to at most one transfer).
 * - `is-refund` — some leg is a refund (`isRefund` or `linkedRefundId` set); a
 *   refund credit must not be netted out twice.
 *
 * The "≥2 distinct accounts" property is deliberately NOT enforced here — it is
 * a suggestion-only heuristic (a same-account zero-sum group the user confirmed
 * is harmless to net out).
 */
export class TransferInvalid extends Schema.TaggedError<TransferInvalid>()(
	"TransferInvalid",
	{
		reason: Schema.Literal(
			"too-few-legs",
			"unbalanced",
			"unknown-id",
			"already-grouped",
			"is-refund",
		),
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
 * **Logo search** is not set up: `GOOGLE_CSE_KEY` and/or `GOOGLE_CSE_CX` are
 * absent from the API's environment (ADR 0007). A *distinct, client-readable
 * state* rather than a generic failure — the UI answers it by explaining what
 * to set, which it cannot do from a 500. `missing` names the absent variables
 * so the explanation is specific.
 *
 * 501 rather than 503: the feature is genuinely not implemented in this
 * deployment, and 503 would imply the client should come back later. Nothing
 * about waiting helps here; someone has to add configuration.
 */
export class LogoSearchUnconfigured extends Schema.TaggedError<LogoSearchUnconfigured>()(
	"LogoSearchUnconfigured",
	{
		missing: Schema.Array(Schema.String),
	},
	HttpApiSchema.annotations({ status: 501 }),
) {}

/**
 * The Programmable Search daily quota is spent — 100 queries/day on the free
 * tier, after which Google refuses for the rest of the day (ADR 0007).
 *
 * Its own error, never folded into {@link LogoSearchFailed}: the fix is *wait
 * or pay*, so a UI that showed this as a transport failure would invite a
 * retry that cannot succeed and would not even cost anything to attempt.
 */
export class LogoSearchQuotaExceeded extends Schema.TaggedError<LogoSearchQuotaExceeded>()(
	"LogoSearchQuotaExceeded",
	{},
	HttpApiSchema.annotations({ status: 429 }),
) {}

/**
 * The call to Programmable Search failed for any reason that is *not* missing
 * configuration and *not* the daily quota: the request never completed, or the
 * response was a status / body this server can't read. A retry may well work,
 * which is exactly what distinguishes it from {@link LogoSearchQuotaExceeded}.
 * `message` is diagnostic text, not a wire contract.
 */
export class LogoSearchFailed extends Schema.TaggedError<LogoSearchFailed>()(
	"LogoSearchFailed",
	{
		message: Schema.String,
	},
	HttpApiSchema.annotations({ status: 502 }),
) {}

/**
 * The server declined to fetch, or could not use, a remote image URL. Raised by
 * the **Logo search** download step, which is an **SSRF sink** — it fetches a
 * caller-supplied URL from inside the API's own network — so most of these
 * reasons are refusals by policy, not failures (ADR 0007).
 *
 * - `invalid-url` — not a parseable absolute URL.
 * - `not-https` — the scheme is not `https:`. Plain HTTP is refused outright
 *   rather than upgraded; `http://` also reaches hosts TLS never would.
 * - `private-address` — the URL resolves to a private, loopback, link-local or
 *   unique-local address. Checked **before connecting**, and again at every
 *   redirect hop, since a permitted host can redirect to an internal one.
 * - `unresolvable` — DNS returned no address for the host.
 * - `too-many-redirects` — the hop cap was reached.
 * - `too-large` — the response exceeded the byte cap. Enforced *while*
 *   streaming, so an endless body is abandoned rather than buffered.
 * - `timeout` — the host was slow or hanging and was abandoned.
 * - `unreachable` — the transport failed, or the host answered with a status
 *   this server can't use.
 * - `not-an-image` — the bytes arrived but do not decode as an image.
 *
 * 422 for all of them: the request was well-formed, the URL in it was not
 * something this server will (or can) turn into an issuer image.
 */
export class ImageFetchRefused extends Schema.TaggedError<ImageFetchRefused>()(
	"ImageFetchRefused",
	{
		reason: Schema.Literal(
			"invalid-url",
			"not-https",
			"private-address",
			"unresolvable",
			"too-many-redirects",
			"too-large",
			"timeout",
			"unreachable",
			"not-an-image",
		),
	},
	HttpApiSchema.annotations({ status: 422 }),
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

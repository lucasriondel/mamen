import { HttpApiSchema } from "@effect/platform";
import { Schema } from "effect";
import { AiProvider, AiTask } from "./ai";

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
 * - `is-bundled` — some leg belongs to a **bundle** (a member) or stands for one
 *   (a **bundle parent**) — issue #75. The two groupings are mutually exclusive:
 *   a transfer leg contributes nothing to the recap (its group nets to zero)
 *   while a bundle member contributes through its parent at a non-zero sum, so a
 *   row holding both would be netted out by the transfer partition while its
 *   parent still displayed its share — a number that disagrees with itself. One
 *   reason covers both roles because it is one rule; which role the row holds is
 *   on the row (`bundleId` vs `kind`). A parent is refused for a second reason
 *   too: its amount is derived from its members, so a zero-sum group validated
 *   at write time could silently stop summing to zero. The mirror refusal —
 *   bundling a transfer leg — is {@link BundleInvalid}'s `is-transfer-leg`: one
 *   rule, told from each side in the vocabulary of the endpoint being called.
 *   Issue #81 settled that split; the reasoning is on {@link BundleInvalid}.
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
			"is-bundled",
		),
	},
	HttpApiSchema.annotations({ status: 422 }),
) {}

/**
 * A **bundle** operation was refused (issues #68, #74) — a bundle being several
 * rows treated as **one** for the recap. Raised by `createBundle` and by the
 * membership changes (`addBundleMember` / `removeBundleMember`), each of which
 * validates its set atomically server-side: the multi-row invariants the generic
 * single-row create/update structurally cannot enforce. A dedicated error rather
 * than an overloaded `NotFound`, so the client can tell "one of these rows is
 * gone" from "one of them is already in a bundle". `reason` is the
 * machine-readable cause:
 *
 * - `too-few-members` — a bundle needs ≥2 distinct members. One row is already
 *   its own account of itself; a parent standing for it would only double the
 *   rows without changing a total. (Reaching that state through a *removal* is
 *   not an error but an **auto-dissolve**: the bundle goes, the row stays.)
 * - `unknown-id` — some id in the set doesn't exist.
 * - `already-bundled` — some row already carries a `bundleId`. A member belongs
 *   to at most one bundle: two parents each claiming to sum it would each be
 *   right about a different number.
 * - `not-a-bundle` — the row named as the bundle to join is not a **bundle
 *   parent**. Nothing derives from a bank row's members, because it has none.
 * - `not-a-member` — the row asked to leave a bundle is in none.
 * - `nested-bundle` — the row being added is itself a bundle parent (a bundle
 *   cannot contain a bundle, nor itself). The outer parent only recomputes when
 *   its OWN membership changes, so editing the inner one would leave the outer
 *   total stale — the second place a bundle's number could go stale, which is
 *   exactly what the single shared recompute exists to prevent.
 * - `is-transfer-leg` — the row already belongs to a **transfer group** (issue
 *   #75). The mirror of {@link TransferInvalid}'s `is-bundled`, and the same one
 *   rule read from the other side: a transfer leg contributes nothing to the
 *   recap (its group nets to zero) while a bundle member contributes through its
 *   parent at a non-zero sum, so a row holding both would be netted out by the
 *   transfer partition while its parent still displayed its share — a number
 *   that disagrees with itself.
 *
 * Mirrors {@link TransferInvalid}, the other multi-row grouping refusal — but is
 * its own error, because a bundle nets to a **non-zero** amount and so shares
 * none of the transfer's balance rules.
 *
 * ## Why the mutual exclusion is TWO error types (issue #81)
 *
 * One rule, two refusals, each raised by the grouping the caller asked for:
 * `is-transfer-leg` here, `is-bundled` on {@link TransferInvalid}. #75's AC read
 * as asking for a single reused type; #81 decided against it and for this split,
 * because:
 *
 * - The `_tag` is the **client's discriminant**, and every endpoint declares
 *   exactly the errors it can produce. Raising `TransferInvalid` from
 *   `create-bundle` would put a transfer error in a bundle endpoint's union, so
 *   every bundle client would have to handle a type whose other reasons
 *   (`too-few-legs`, `unbalanced`, `already-grouped`, `is-refund`) it can never
 *   receive — a wider surface than the rule needs.
 * - What #75 was actually guarding against is a **third, parallel type** for one
 *   rule, and there is none: each direction reuses the 422 its own grouping
 *   already raises, adding one `reason` to an enum that already existed.
 * - The caller speaks one of the two vocabularies. `create-bundle` is told *that
 *   row is a transfer leg*; `link-transfer` is told *that row is bundled*. The
 *   two enums already mirror each other exactly — `already-bundled` /
 *   `already-grouped` for the within-domain clash, `is-transfer-leg` /
 *   `is-bundled` for the cross-domain one.
 * - Both are 422 with a `reason` literal, so a client that wants to treat the
 *   two refusals identically still can, without either type having to know the
 *   other's rules.
 *
 * Pinned by `api/src/transactions/grouping-refusal-surface.test.ts`: each
 * grouping endpoint declares only its own error, each enum carries only its own
 * side of the exclusivity, and no third type carries either reason.
 */
export class BundleInvalid extends Schema.TaggedError<BundleInvalid>()(
	"BundleInvalid",
	{
		reason: Schema.Literal(
			"too-few-members",
			"unknown-id",
			"already-bundled",
			"not-a-bundle",
			"not-a-member",
			"nested-bundle",
			"is-transfer-leg",
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
 * **Logo search** is not set up: `LOGODEV_TOKEN` is absent from the API's
 * environment (ADR 0007, amended). A *distinct, client-readable
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
 * logo.dev's rate limit is spent — it answered 429, and will keep refusing
 * until the window resets (ADR 0007, amended).
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
 * The call to logo.dev failed for any reason that is *not* missing
 * configuration and *not* the rate limit: the request never completed, or the
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
 * A pasted credential was refused (issue #117, ADR 0011). `reason` is the whole
 * error: a **reason code**, never the value — a refusal that quoted the paste
 * back would put a secret in an HTTP response body, a browser console and
 * whatever log sits between them, which is precisely what storing it encrypted
 * exists to prevent. It also travels through no `message` field for the same
 * reason: there is nowhere in this type for a value to hide.
 *
 * - `blank` — the paste is empty, or only whitespace.
 * - `too-short` — shorter than `SECRET_MIN_LENGTH` once trimmed. No vendor
 *   issues a credential that short, so this is a stray or truncated paste; it is
 *   its own reason rather than folded into `blank` because the two are fixed
 *   differently (paste something vs. paste the whole thing).
 *
 * 422 for both: the request was well-formed, the value in it was not one this
 * server will store.
 */
export class SecretRejected extends Schema.TaggedError<SecretRejected>()(
	"SecretRejected",
	{
		reason: Schema.Literal("blank", "too-short"),
	},
	HttpApiSchema.annotations({ status: 422 }),
) {}

/**
 * An **AI task** would have been left pointing at a provider that cannot run it
 * (issue #119, PRD #115). The one rule the save-time check exists to keep, and
 * the same error whichever of the two doors raised it — patching a task's
 * provider/model, or deleting a credential a task is pointed at.
 *
 * It names the `task` that cannot run and the `provider` it would have run on,
 * because a patch may touch several tasks and "which one was wrong" is the only
 * thing the user can act on. It carries **no credential of any kind** — not a
 * value, not a hint — for the reasons {@link SecretRejected} carries none.
 *
 * - `model-not-served` — the provider does not serve that model. Checked
 *   **before** the credential: an impossible pairing is wrong whether or not a
 *   key exists, and telling the user to go and store a key would send them to
 *   fix the wrong thing.
 * - `no-credential` — a hosted vendor with nothing stored. `claude-code` never
 *   raises this: its token is a run-time concern, and checking it here would
 *   refuse every save on a fresh install, including the save that switches away
 *   from it.
 * - `credential-in-use` — the deletion door: clearing this credential would turn
 *   a task that runs today into one that cannot. Raised only when the deletion
 *   is what breaks it, so a task already unrunnable for some other reason does
 *   not hold an unrelated key hostage.
 *
 * 422, like every other refusal of a well-formed request carrying a value this
 * server will not store.
 */
export class TaskProviderRejected extends Schema.TaggedError<TaskProviderRejected>()(
	"TaskProviderRejected",
	{
		task: AiTask,
		provider: AiProvider,
		reason: Schema.Literal(
			"model-not-served",
			"no-credential",
			"credential-in-use",
		),
	},
	HttpApiSchema.annotations({ status: 422 }),
) {}

/**
 * A run was asked of an **AI provider** that has no credential stored (issue
 * #122, PRD #115) — the Claude Code token was never pasted, or a hosted vendor's
 * key was cleared between the save-time check and the run.
 *
 * It is the **one extraction failure that is client-actionable**, which is the
 * whole reason it is not {@link ExtractionFailed}. Every other upstream tag
 * still collapses to that opaque, retry-able 502 (ADR 0005): retrying is the
 * only thing left to try. Here retrying is exactly what does not help — someone
 * has to go to the AI settings page and paste a credential — so the client has
 * to be able to tell the two apart, and does, by the `_tag`.
 *
 * It names the `task` that could not run and the `provider` it would have run
 * on, so the page can point at the tile to fill in. Like every other error that
 * touches a credential it carries **no value and no hint**: there is nowhere in
 * this type for a secret to hide.
 *
 * 501, matching {@link LogoSearchUnconfigured}, the other "this deployment has
 * not been configured for that" refusal: nothing about waiting helps, so 503
 * would invite a retry that cannot succeed, and the 502 next door already means
 * "try again". The status is distinct from both errors `extractPdf` can
 * otherwise return, so a client decoding by status alone still tells them apart.
 */
export class AiProviderNotConfigured extends Schema.TaggedError<AiProviderNotConfigured>()(
	"AiProviderNotConfigured",
	{
		task: AiTask,
		provider: AiProvider,
	},
	HttpApiSchema.annotations({ status: 501 }),
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

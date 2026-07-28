import {
	HttpApiEndpoint,
	HttpApiGroup,
	HttpApiSchema,
	Multipart,
	OpenApi,
} from "@effect/platform";
import { Option, Schema } from "effect";
import {
	CategoryNotLeaf,
	ImageFetchRefused,
	InvalidFileType,
	LogoSearchFailed,
	LogoSearchQuotaExceeded,
	LogoSearchUnconfigured,
	NotFound,
} from "./errors";
import { CategoryId, IssuerId, numFromStr } from "./ids";
import { Paged, Pagination } from "./pagination";

/**
 * The image-upload size limit: 2 MiB, matching the old Fastify server's global
 * `{ fileSize: 2_097_152 }`. There is no `PersistedFile.size` field, so the
 * ceiling is enforced by the multipart parser via `maxFileSize` (a breach yields
 * a framework `MultipartError`), not by the handler.
 *
 * Since every accepted upload is resized server-side (ADR 0007) the cap no
 * longer bounds what is *stored* — a stored image is 128×128 WebP, a few KB
 * whatever arrived. It survives as the **pre-decode** guard: it bounds what
 * sharp is asked to open, which is the real denial-of-service concern, and only
 * a limit enforced by the parser can run before the decode does.
 */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/** Issuer entity — the wire shape returned by every issuers endpoint. */
export class Issuer extends Schema.Class<Issuer>("Issuer")({
	id: IssuerId,
	name: Schema.String,
	imageUrl: Schema.optional(Schema.String), // root-relative "/uploads/issuers/..."
	defaultCategoryId: Schema.optional(CategoryId),
	createdAt: Schema.Date,
	firstSeen: Schema.Date,
}) {}

/**
 * Create payload — the server assigns `id` and `createdAt`. `firstSeen` is
 * caller-provided (faithful port: the old adapter accepted it on the record).
 */
export const IssuerCreate = Schema.Struct({
	name: Issuer.fields.name,
	imageUrl: Issuer.fields.imageUrl,
	defaultCategoryId: Issuer.fields.defaultCategoryId,
	firstSeen: Issuer.fields.firstSeen,
});
export type IssuerCreate = typeof IssuerCreate.Type;

/**
 * Update payload — every field optional (partial update). `defaultCategoryId`
 * is additionally **nullable**: a `null` *clears* the issuer's default category
 * (the "undo a categorisation" gesture), which absent-means-unchanged can't
 * express. A present leaf id sets it; the API rejects a folder ({@link
 * CategoryNotLeaf}).
 */
export const IssuerUpdate = Schema.partial(
	Schema.Struct({
		...IssuerCreate.fields,
		defaultCategoryId: Schema.NullOr(CategoryId),
	}),
);
export type IssuerUpdate = typeof IssuerUpdate.Type;

/**
 * `list` filter (contract §2.4): `orderBy: "name"` orders by name (else natural
 * insertion order). Spread alongside `Pagination`. Faithful to today, where only
 * `orderBy=name` is recognized.
 */
export const IssuerListFilters = {
	orderBy: Schema.optional(Schema.Literal("name")),
} as const;

/**
 * The multipart upload payload for `uploadImage`. One file under the key
 * `file`; `maxFileSize` caps it at {@link MAX_IMAGE_BYTES} and `maxParts` at 1
 * (matching the old `{ fileSize, files: 1 }`). The jpeg/png/webp/gif allow-list
 * is NOT expressible here — the handler enforces it and fails `InvalidFileType`,
 * as it does for a body that doesn't decode as an image at all. The declared
 * format only gates acceptance; what lands on disk is always WebP (ADR 0007).
 * The derived client types this as `FormData`.
 */
export const IssuerImageUpload = HttpApiSchema.Multipart(
	Schema.Struct({ file: Multipart.SingleFileSchema }),
	{
		maxFileSize: Option.some(MAX_IMAGE_BYTES),
		maxParts: Option.some(1),
	},
);

/**
 * One **Logo search** hit, reduced to what the picker needs. `thumbnailUrl` is
 * what the grid renders (small); `imageUrl` is the full-size version and is
 * the URL handed back to `setImageFromUrl`. `contextUrl`, `width` and `height`
 * are optional provenance/metadata a provider may or may not supply — with
 * logo.dev (ADR 0007, amended) both URLs point at its image CDN and the
 * optional fields are absent.
 *
 * The URLs are provider-supplied and unvalidated — the server does not trust
 * them either, because `setImageFromUrl` is reachable independently of any
 * search and so must guard the URL it is given whatever its provenance (ADR
 * 0007).
 */
export class LogoSearchResult extends Schema.Class<LogoSearchResult>(
	"LogoSearchResult",
)({
	title: Schema.String,
	imageUrl: Schema.String,
	thumbnailUrl: Schema.String,
	contextUrl: Schema.optional(Schema.String),
	width: Schema.optional(Schema.Number),
	height: Schema.optional(Schema.Number),
}) {}

/** The `searchLogos` success body. A struct, so extra facets can be added later
 * without a breaking change to a bare array. */
export const LogoSearchResults = Schema.Struct({
	results: Schema.Array(LogoSearchResult),
});

/**
 * `searchLogos` url params. `q` is the whole query — the client pre-fills it
 * with the issuer's name (logo.dev resolves brand *names*, so no "logo"
 * suffix), but the server takes it verbatim rather than composing it, so a
 * user who edits the box gets what they typed.
 * `Schema.NonEmptyTrimmedString` refuses a blank query at the boundary: it
 * would spend an upstream call to get nothing back.
 */
export const LogoSearchQuery = Schema.Struct({
	q: Schema.NonEmptyTrimmedString,
});

/**
 * `setImageFromUrl` payload — the chosen result's full-size URL. Deliberately a
 * bare `Schema.String`: every meaningful constraint on it (https-only, not a
 * private address, at any redirect hop) needs DNS and cannot be a schema, so
 * pretending otherwise here would only split the guard across two places. The
 * server refuses with {@link ImageFetchRefused}.
 */
export const IssuerImageFromUrl = Schema.Struct({
	url: Schema.String,
});
export type IssuerImageFromUrl = typeof IssuerImageFromUrl.Type;

/**
 * Issuers group (contract §2.4), prefix `/issuers`. Includes the image
 * upload + delete. No issuer-name uniqueness constraint today (faithful port),
 * so `create`/`update` declare no `Conflict`. `getById`/`getByName`/`getByNameCi`
 * /`update`/`remove`/`uploadImage`/`deleteImage` 404 on a missing issuer
 * (`remove` now 404s — behavior change vs the old silent `{ ok: true }`).
 * `create`/`update` declare `CategoryNotLeaf`: an issuer's default category must
 * be an assignable leaf (a category with no children), never a folder — the
 * **Leaf-assignable invariant** at any depth (ADR 0003).
 * `uploadImage` additionally declares `InvalidFileType`. Dropped vs today: `PUT
 * /issuers/bulk-put` (client-only). The `/uploads/*` static route is a
 * separate wildcard route, not part of this contract.
 *
 * The two **Logo search** endpoints (ADR 0007, amended) sit alongside the
 * upload: `searchLogos` proxies logo.dev's Logo API (server-side so the
 * contract stays provider-agnostic and configuration lives in one place), and
 * `setImageFromUrl` downloads a chosen result through the same normalisation
 * pipeline as the upload, so a searched image and an uploaded one are
 * byte-identical in form.
 * `GET /issuers/logo-search` is a static sibling of `GET /issuers/:id` — the
 * router prefers the literal segment, as it already does for
 * `/transactions/count`.
 *
 * **Neither is authenticated**, like the rest of the API. `setImageFromUrl` is
 * therefore an open fetch proxy and `searchLogos` spends the owner's logo.dev
 * rate budget for anyone who asks. Auth and rate-limiting are deferred and must
 * land before public deployment — see
 * `docs/operations/logo-search-setup.md`.
 */
export class IssuersGroup extends HttpApiGroup.make("issuers")
	.add(
		HttpApiEndpoint.get("list")`/issuers`
			.setUrlParams(Schema.Struct({ ...Pagination, ...IssuerListFilters }))
			.addSuccess(Paged(Issuer)),
	)
	.add(
		HttpApiEndpoint.get(
			"getById",
		)`/issuers/${HttpApiSchema.param("id", numFromStr(IssuerId))}`
			.addSuccess(Issuer)
			.addError(NotFound),
	)
	.add(
		HttpApiEndpoint.get(
			"getByName",
		)`/issuers/by-name/${HttpApiSchema.param("name", Schema.String)}`
			.addSuccess(Issuer)
			.addError(NotFound),
	)
	.add(
		HttpApiEndpoint.get(
			"getByNameCi",
		)`/issuers/by-name-ci/${HttpApiSchema.param("name", Schema.String)}`
			.addSuccess(Issuer)
			.addError(NotFound),
	)
	.add(
		HttpApiEndpoint.post("create")`/issuers`
			.setPayload(IssuerCreate)
			.addSuccess(Issuer, { status: 201 })
			.addError(CategoryNotLeaf),
	)
	.add(
		HttpApiEndpoint.put(
			"update",
		)`/issuers/${HttpApiSchema.param("id", numFromStr(IssuerId))}`
			.setPayload(IssuerUpdate)
			.addSuccess(Issuer)
			.addError(NotFound)
			.addError(CategoryNotLeaf),
	)
	.add(
		HttpApiEndpoint.del(
			"remove",
		)`/issuers/${HttpApiSchema.param("id", numFromStr(IssuerId))}`
			.addSuccess(HttpApiSchema.NoContent)
			.addError(NotFound),
	)
	.add(
		HttpApiEndpoint.post(
			"uploadImage",
		)`/issuers/${HttpApiSchema.param("id", numFromStr(IssuerId))}/image`
			.setPayload(IssuerImageUpload)
			.addSuccess(Issuer)
			.addError(NotFound)
			.addError(InvalidFileType),
	)
	.add(
		HttpApiEndpoint.del(
			"deleteImage",
		)`/issuers/${HttpApiSchema.param("id", numFromStr(IssuerId))}/image`
			.addSuccess(Issuer)
			.addError(NotFound),
	)
	.add(
		HttpApiEndpoint.get("searchLogos")`/issuers/logo-search`
			.setUrlParams(LogoSearchQuery)
			.addSuccess(LogoSearchResults)
			.addError(LogoSearchUnconfigured)
			.addError(LogoSearchQuotaExceeded)
			.addError(LogoSearchFailed),
	)
	.add(
		HttpApiEndpoint.post(
			"setImageFromUrl",
		)`/issuers/${HttpApiSchema.param("id", numFromStr(IssuerId))}/image/from-url`
			.setPayload(IssuerImageFromUrl)
			.addSuccess(Issuer)
			.addError(NotFound)
			.addError(ImageFetchRefused),
	)
	.annotateContext(OpenApi.annotations({ title: "Issuers" })) {}

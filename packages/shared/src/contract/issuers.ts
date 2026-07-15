import {
	HttpApiEndpoint,
	HttpApiGroup,
	HttpApiSchema,
	Multipart,
	OpenApi,
} from "@effect/platform";
import { Option, Schema } from "effect";
import { CategoryNotLeaf, InvalidFileType, NotFound } from "./errors";
import { CategoryId, IssuerId, numFromStr } from "./ids";
import { Paged, Pagination } from "./pagination";

/**
 * The image-upload size limit: 2 MiB, matching the old Fastify server's global
 * `{ fileSize: 2_097_152 }`. There is no `PersistedFile.size` field, so the
 * ceiling is enforced by the multipart parser via `maxFileSize` (a breach yields
 * a framework `MultipartError`), not by the handler.
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
 * is NOT expressible here — the handler enforces it and fails `InvalidFileType`.
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
 * Issuers group (contract §2.4), prefix `/issuers`. Includes the image
 * upload + delete. No issuer-name uniqueness constraint today (faithful port),
 * so `create`/`update` declare no `Conflict`. `getById`/`getByName`/`getByNameCi`
 * /`update`/`remove`/`uploadImage`/`deleteImage` 404 on a missing issuer
 * (`remove` now 404s — behavior change vs the old silent `{ ok: true }`).
 * `create`/`update` declare `CategoryNotLeaf`: an issuer's default category must
 * be an assignable leaf, never a folder (two-level invariant, ADR 0001).
 * `uploadImage` additionally declares `InvalidFileType`. Dropped vs today: `PUT
 * /issuers/bulk-put` (client-only). The `/uploads/*` static route is a
 * separate wildcard route, not part of this contract.
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
	.annotateContext(OpenApi.annotations({ title: "Issuers" })) {}

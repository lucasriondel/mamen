import {
	HttpApiEndpoint,
	HttpApiGroup,
	HttpApiSchema,
	Multipart,
	OpenApi,
} from "@effect/platform";
import { Option, Schema } from "effect";
import { InvalidFileType, NotFound } from "./errors";
import { CategoryId, MerchantId, numFromStr } from "./ids";
import { Paged, Pagination } from "./pagination";

/**
 * The image-upload size limit: 2 MiB, matching the old Fastify server's global
 * `{ fileSize: 2_097_152 }`. There is no `PersistedFile.size` field, so the
 * ceiling is enforced by the multipart parser via `maxFileSize` (a breach yields
 * a framework `MultipartError`), not by the handler.
 */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/** Merchant entity — the wire shape returned by every merchants endpoint. */
export class Merchant extends Schema.Class<Merchant>("Merchant")({
	id: MerchantId,
	name: Schema.String,
	imageUrl: Schema.optional(Schema.String), // root-relative "/uploads/merchants/..."
	defaultCategoryId: Schema.optional(CategoryId),
	createdAt: Schema.Date,
	firstSeen: Schema.Date,
}) {}

/**
 * Create payload — the server assigns `id` and `createdAt`. `firstSeen` is
 * caller-provided (faithful port: the old adapter accepted it on the record).
 */
export const MerchantCreate = Schema.Struct({
	name: Merchant.fields.name,
	imageUrl: Merchant.fields.imageUrl,
	defaultCategoryId: Merchant.fields.defaultCategoryId,
	firstSeen: Merchant.fields.firstSeen,
});
export type MerchantCreate = typeof MerchantCreate.Type;

/** Update payload — every field optional (partial update). */
export const MerchantUpdate = Schema.partial(MerchantCreate);
export type MerchantUpdate = typeof MerchantUpdate.Type;

/**
 * `list` filter (contract §2.4): `orderBy: "name"` orders by name (else natural
 * insertion order). Spread alongside `Pagination`. Faithful to today, where only
 * `orderBy=name` is recognized.
 */
export const MerchantListFilters = {
	orderBy: Schema.optional(Schema.Literal("name")),
} as const;

/**
 * The multipart upload payload for `uploadImage`. One file under the key
 * `file`; `maxFileSize` caps it at {@link MAX_IMAGE_BYTES} and `maxParts` at 1
 * (matching the old `{ fileSize, files: 1 }`). The jpeg/png/webp/gif allow-list
 * is NOT expressible here — the handler enforces it and fails `InvalidFileType`.
 * The derived client types this as `FormData`.
 */
export const MerchantImageUpload = HttpApiSchema.Multipart(
	Schema.Struct({ file: Multipart.SingleFileSchema }),
	{
		maxFileSize: Option.some(MAX_IMAGE_BYTES),
		maxParts: Option.some(1),
	},
);

/**
 * Merchants group (contract §2.4), prefix `/merchants`. Includes the image
 * upload + delete. No merchant-name uniqueness constraint today (faithful port),
 * so `create`/`update` declare no `Conflict`. `getById`/`getByName`/`getByNameCi`
 * /`update`/`remove`/`uploadImage`/`deleteImage` 404 on a missing merchant
 * (`remove` now 404s — behavior change vs the old silent `{ ok: true }`).
 * `uploadImage` additionally declares `InvalidFileType`. Dropped vs today: `PUT
 * /merchants/bulk-put` (client-only). The `/uploads/*` static route is a
 * separate wildcard route, not part of this contract.
 */
export class MerchantsGroup extends HttpApiGroup.make("merchants")
	.add(
		HttpApiEndpoint.get("list")`/merchants`
			.setUrlParams(Schema.Struct({ ...Pagination, ...MerchantListFilters }))
			.addSuccess(Paged(Merchant)),
	)
	.add(
		HttpApiEndpoint.get(
			"getById",
		)`/merchants/${HttpApiSchema.param("id", numFromStr(MerchantId))}`
			.addSuccess(Merchant)
			.addError(NotFound),
	)
	.add(
		HttpApiEndpoint.get(
			"getByName",
		)`/merchants/by-name/${HttpApiSchema.param("name", Schema.String)}`
			.addSuccess(Merchant)
			.addError(NotFound),
	)
	.add(
		HttpApiEndpoint.get(
			"getByNameCi",
		)`/merchants/by-name-ci/${HttpApiSchema.param("name", Schema.String)}`
			.addSuccess(Merchant)
			.addError(NotFound),
	)
	.add(
		HttpApiEndpoint.post("create")`/merchants`
			.setPayload(MerchantCreate)
			.addSuccess(Merchant, { status: 201 }),
	)
	.add(
		HttpApiEndpoint.put(
			"update",
		)`/merchants/${HttpApiSchema.param("id", numFromStr(MerchantId))}`
			.setPayload(MerchantUpdate)
			.addSuccess(Merchant)
			.addError(NotFound),
	)
	.add(
		HttpApiEndpoint.del(
			"remove",
		)`/merchants/${HttpApiSchema.param("id", numFromStr(MerchantId))}`
			.addSuccess(HttpApiSchema.NoContent)
			.addError(NotFound),
	)
	.add(
		HttpApiEndpoint.post(
			"uploadImage",
		)`/merchants/${HttpApiSchema.param("id", numFromStr(MerchantId))}/image`
			.setPayload(MerchantImageUpload)
			.addSuccess(Merchant)
			.addError(NotFound)
			.addError(InvalidFileType),
	)
	.add(
		HttpApiEndpoint.del(
			"deleteImage",
		)`/merchants/${HttpApiSchema.param("id", numFromStr(MerchantId))}/image`
			.addSuccess(Merchant)
			.addError(NotFound),
	)
	.annotateContext(OpenApi.annotations({ title: "Merchants" })) {}

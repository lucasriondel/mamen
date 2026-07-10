import {
	HttpApiEndpoint,
	HttpApiGroup,
	HttpApiSchema,
	OpenApi,
} from "@effect/platform";
import { Schema } from "effect";
import { NotFound } from "./errors";
import { MerchantId, numFromStr, SubscriptionId, TransactionId } from "./ids";
import { Paged, Pagination } from "./pagination";

/** The recurrence cadence of a subscription. */
export const SubscriptionFrequency = Schema.Literal(
	"weekly",
	"monthly",
	"yearly",
);
export type SubscriptionFrequency = typeof SubscriptionFrequency.Type;

/** Detection lifecycle of a subscription. */
export const SubscriptionStatus = Schema.Literal("active", "possibly-cancelled");
export type SubscriptionStatus = typeof SubscriptionStatus.Type;

/**
 * Subscription entity — the wire shape returned by every subscriptions endpoint.
 * `merchantName` is denormalized off the merchant. **Faithful port (spec §1.2)**:
 * the four date fields (`lastChargeDate`, `firstChargeDate`, `detectedAt`,
 * `updatedAt`) stay `Schema.String`, NOT `Schema.Date` — they are strings in both
 * the entity and the DB column today and are not upgraded.
 */
export class Subscription extends Schema.Class<Subscription>("Subscription")({
	id: SubscriptionId,
	merchantId: MerchantId,
	merchantName: Schema.String, // denormalized
	typicalAmount: Schema.Number,
	frequency: SubscriptionFrequency,
	intervalDays: Schema.Number,
	lastChargeDate: Schema.String, // string, not Date (faithful)
	firstChargeDate: Schema.String,
	chargeCount: Schema.Number,
	status: SubscriptionStatus,
	transactionIds: Schema.Array(TransactionId),
	detectedAt: Schema.String,
	updatedAt: Schema.String,
}) {}

/** Create payload — the server assigns `id`; every other field is caller-provided. */
export const SubscriptionCreate = Schema.Struct({
	merchantId: Subscription.fields.merchantId,
	merchantName: Subscription.fields.merchantName,
	typicalAmount: Subscription.fields.typicalAmount,
	frequency: Subscription.fields.frequency,
	intervalDays: Subscription.fields.intervalDays,
	lastChargeDate: Subscription.fields.lastChargeDate,
	firstChargeDate: Subscription.fields.firstChargeDate,
	chargeCount: Subscription.fields.chargeCount,
	status: Subscription.fields.status,
	transactionIds: Subscription.fields.transactionIds,
	detectedAt: Subscription.fields.detectedAt,
	updatedAt: Subscription.fields.updatedAt,
});
export type SubscriptionCreate = typeof SubscriptionCreate.Type;

/** Update payload — every field optional (partial update). */
export const SubscriptionUpdate = Schema.partial(SubscriptionCreate);
export type SubscriptionUpdate = typeof SubscriptionUpdate.Type;

/**
 * `list` filters (contract §2.7): `merchantId?` + `status?`, **composable** and
 * `AND`-combined — replacing the old `merchantId > status` precedence (either/or).
 * `merchantId` decodes + brands a query string via `numFromStr`; `status` is the
 * validated literal union. Spread alongside `Pagination` on `list`.
 */
export const SubscriptionListFilters = {
	merchantId: Schema.optional(numFromStr(MerchantId)),
	status: Schema.optional(SubscriptionStatus),
} as const;

/**
 * Subscriptions group (contract §2.7), prefix `/subscriptions`. No uniqueness
 * constraint on any field (faithful port), so `create`/`update` declare no
 * `Conflict`. `update` / `getFirstByMerchant` / `getByMerchantFrequency` 404 on a
 * missing subscription. `list` composes its `merchantId?` + `status?` filters.
 * The `frequency` path segment is a validated `Schema.Literal` (a bad value fails
 * decode → 400) — was an unchecked cast in the old server. Dropped vs today:
 * `GET /subscriptions/:id`, `DELETE /subscriptions/:id`, `PUT /subscriptions/bulk-put`,
 * `POST /subscriptions/clear` (all client-only).
 */
export class SubscriptionsGroup extends HttpApiGroup.make("subscriptions")
	.add(
		HttpApiEndpoint.get("list")`/subscriptions`
			.setUrlParams(
				Schema.Struct({ ...Pagination, ...SubscriptionListFilters }),
			)
			.addSuccess(Paged(Subscription)),
	)
	.add(
		HttpApiEndpoint.post("create")`/subscriptions`
			.setPayload(SubscriptionCreate)
			.addSuccess(Subscription, { status: 201 }),
	)
	.add(
		HttpApiEndpoint.put(
			"update",
		)`/subscriptions/${HttpApiSchema.param("id", numFromStr(SubscriptionId))}`
			.setPayload(SubscriptionUpdate)
			.addSuccess(Subscription)
			.addError(NotFound),
	)
	.add(
		HttpApiEndpoint.get(
			"getFirstByMerchant",
		)`/subscriptions/first-by-merchant/${HttpApiSchema.param("merchantId", numFromStr(MerchantId))}`
			.addSuccess(Subscription)
			.addError(NotFound),
	)
	.add(
		HttpApiEndpoint.get(
			"getByMerchantFrequency",
		)`/subscriptions/by-merchant-frequency/${HttpApiSchema.param("merchantId", numFromStr(MerchantId))}/${HttpApiSchema.param("frequency", SubscriptionFrequency)}`
			.addSuccess(Subscription)
			.addError(NotFound),
	)
	.annotateContext(OpenApi.annotations({ title: "Subscriptions" })) {}

import {
	HttpApiEndpoint,
	HttpApiGroup,
	HttpApiSchema,
	OpenApi,
} from "@effect/platform";
import { Schema } from "effect";
import { NotFound } from "./errors";
import { IssuerId, numFromStr, SubscriptionId, TransactionId } from "./ids";
import { Paged, Pagination } from "./pagination";

/** The recurrence cadence of a subscription. */
export const SubscriptionFrequency = Schema.Literal(
	"weekly",
	"monthly",
	"yearly",
);
export type SubscriptionFrequency = typeof SubscriptionFrequency.Type;

/** Detection lifecycle of a subscription. */
export const SubscriptionStatus = Schema.Literal(
	"active",
	"possibly-cancelled",
);
export type SubscriptionStatus = typeof SubscriptionStatus.Type;

/**
 * Subscription entity — the wire shape returned by every subscriptions endpoint.
 * `issuerName` is denormalized off the issuer. **Faithful port (spec §1.2)**:
 * the four date fields (`lastChargeDate`, `firstChargeDate`, `detectedAt`,
 * `updatedAt`) stay `Schema.String`, NOT `Schema.Date` — they are strings in both
 * the entity and the DB column today and are not upgraded.
 */
export class Subscription extends Schema.Class<Subscription>("Subscription")({
	id: SubscriptionId,
	issuerId: IssuerId,
	issuerName: Schema.String, // denormalized
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
	issuerId: Subscription.fields.issuerId,
	issuerName: Subscription.fields.issuerName,
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
 * `list` filters (contract §2.7): `issuerId?` + `status?`, **composable** and
 * `AND`-combined — replacing the old `issuerId > status` precedence (either/or).
 * `issuerId` decodes + brands a query string via `numFromStr`; `status` is the
 * validated literal union. Spread alongside `Pagination` on `list`.
 */
export const SubscriptionListFilters = {
	issuerId: Schema.optional(numFromStr(IssuerId)),
	status: Schema.optional(SubscriptionStatus),
} as const;

/**
 * Subscriptions group (contract §2.7), prefix `/subscriptions`. No uniqueness
 * constraint on any field (faithful port), so `create`/`update` declare no
 * `Conflict`. `update` / `getFirstByIssuer` / `getByIssuerFrequency` 404 on a
 * missing subscription. `list` composes its `issuerId?` + `status?` filters.
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
			"getFirstByIssuer",
		)`/subscriptions/first-by-issuer/${HttpApiSchema.param("issuerId", numFromStr(IssuerId))}`
			.addSuccess(Subscription)
			.addError(NotFound),
	)
	.add(
		HttpApiEndpoint.get(
			"getByIssuerFrequency",
		)`/subscriptions/by-issuer-frequency/${HttpApiSchema.param("issuerId", numFromStr(IssuerId))}/${HttpApiSchema.param("frequency", SubscriptionFrequency)}`
			.addSuccess(Subscription)
			.addError(NotFound),
	)
	.annotateContext(OpenApi.annotations({ title: "Subscriptions" })) {}

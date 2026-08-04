import {
	HttpApiEndpoint,
	HttpApiGroup,
	HttpApiSchema,
	OpenApi,
} from "@effect/platform";
import { Schema } from "effect";
import { NotFound } from "./errors";
import { AccountId, numFromStr } from "./ids";
import { Paged, Pagination } from "./pagination";

/**
 * Account entity — the wire shape returned by every accounts endpoint.
 *
 * `color` is nullable and null means **auto**, not *absent*: accounts are a flat
 * list with no parent to inherit from (unlike a Category — ADR 0006), so there
 * is nothing to resolve up a tree. A null instead resolves to a stable palette
 * entry derived from the account's `id`, which is why no migration backfills the
 * column: every pre-existing account already paints a distinct badge, and a user
 * who never opens the colour picker never sees an uncoloured account.
 */
export class Account extends Schema.Class<Account>("Account")({
	id: AccountId,
	name: Schema.String,
	type: Schema.Literal("checking", "savings", "credit_card", "other"),
	color: Schema.NullOr(Schema.String), // null = auto-derive from id
	createdAt: Schema.Date,
	updatedAt: Schema.Date,
}) {}

/**
 * Create payload — the server assigns `id`, `createdAt`, `updatedAt`. `color` is
 * optional here (rather than nullable-required) so existing callers that only
 * send `name`/`type` stay valid; an omitted colour lands as null, i.e. auto.
 */
export const AccountCreate = Schema.Struct({
	name: Account.fields.name,
	type: Account.fields.type,
	color: Schema.optional(Account.fields.color),
});
export type AccountCreate = typeof AccountCreate.Type;

/** Update payload — every field optional (partial update). */
export const AccountUpdate = Schema.partial(AccountCreate);
export type AccountUpdate = typeof AccountUpdate.Type;

/**
 * Accounts group (contract §2.2), prefix `/accounts`. No uniqueness constraint
 * on accounts → `create`/`update` declare no `Conflict`. `update`/`remove` now
 * 404 on a missing id (behavior change vs the old silent `{ ok: true }`).
 */
export class AccountsGroup extends HttpApiGroup.make("accounts")
	.add(
		HttpApiEndpoint.get("list")`/accounts`
			.setUrlParams(Schema.Struct(Pagination))
			.addSuccess(Paged(Account)),
	)
	.add(
		HttpApiEndpoint.get(
			"getById",
		)`/accounts/${HttpApiSchema.param("id", numFromStr(AccountId))}`
			.addSuccess(Account)
			.addError(NotFound),
	)
	.add(
		HttpApiEndpoint.get(
			"getByName",
		)`/accounts/by-name/${HttpApiSchema.param("name", Schema.String)}`
			.addSuccess(Account)
			.addError(NotFound),
	)
	.add(
		HttpApiEndpoint.post("create")`/accounts`
			.setPayload(AccountCreate)
			.addSuccess(Account, { status: 201 }),
	)
	.add(
		HttpApiEndpoint.put(
			"update",
		)`/accounts/${HttpApiSchema.param("id", numFromStr(AccountId))}`
			.setPayload(AccountUpdate)
			.addSuccess(Account)
			.addError(NotFound),
	)
	.add(
		HttpApiEndpoint.del(
			"remove",
		)`/accounts/${HttpApiSchema.param("id", numFromStr(AccountId))}`
			.addSuccess(HttpApiSchema.NoContent)
			.addError(NotFound),
	)
	.annotateContext(OpenApi.annotations({ title: "Accounts" })) {}

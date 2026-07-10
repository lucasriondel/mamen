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

/** Account entity — the wire shape returned by every accounts endpoint. */
export class Account extends Schema.Class<Account>("Account")({
	id: AccountId,
	name: Schema.String,
	type: Schema.Literal("checking", "savings", "credit_card", "other"),
	createdAt: Schema.Date,
	updatedAt: Schema.Date,
}) {}

/** Create payload — the server assigns `id`, `createdAt`, `updatedAt`. */
export const AccountCreate = Schema.Struct({
	name: Account.fields.name,
	type: Account.fields.type,
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

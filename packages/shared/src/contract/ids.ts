import { Schema } from "effect";

/**
 * Branded id schemas, one per resource. Ids are numeric (integer, sqlite
 * AUTOINCREMENT) but branded so a `MerchantId` can't be passed where an
 * `AccountId` is expected across the contract. There is no DB-level foreign
 * key enforcement — the brand is a compile-time / contract-level guard only.
 */
export const AccountId = Schema.Int.pipe(Schema.brand("AccountId"));
export type AccountId = typeof AccountId.Type;

export const CategoryId = Schema.Int.pipe(Schema.brand("CategoryId"));
export type CategoryId = typeof CategoryId.Type;

export const MerchantId = Schema.Int.pipe(Schema.brand("MerchantId"));
export type MerchantId = typeof MerchantId.Type;

export const TransactionId = Schema.Int.pipe(Schema.brand("TransactionId"));
export type TransactionId = typeof TransactionId.Type;

export const RuleId = Schema.Int.pipe(Schema.brand("RuleId"));
export type RuleId = typeof RuleId.Type;

export const SubscriptionId = Schema.Int.pipe(Schema.brand("SubscriptionId"));
export type SubscriptionId = typeof SubscriptionId.Type;

export const SettingId = Schema.Int.pipe(Schema.brand("SettingId"));
export type SettingId = typeof SettingId.Type;

/**
 * Decodes a URL segment / query string ("42") into a branded id. Use for
 * `HttpApiSchema.param("id", numFromStr(AccountId))` path params and for
 * branded-id list filters in query position. A non-numeric string fails
 * schema decode → `HttpApiDecodeError (400)` automatically.
 */
export const numFromStr = <B extends string>(
	id: Schema.brand<typeof Schema.Int, B>,
) => Schema.NumberFromString.pipe(Schema.compose(id));

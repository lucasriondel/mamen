import { SqlClient } from "@effect/sql";
import {
	Account,
	AppSettings,
	Category,
	type DbImport,
	Setting,
} from "@mamen/shared/contract";
import { Effect, Schema } from "effect";
import { orDieSql } from "../db/errors";
import { IssuerFromRow } from "../issuers/repository";
import { RuleFromRow } from "../rules/repository";
import { SubscriptionFromRow } from "../subscriptions/repository";
import { TransactionFromRow } from "../transactions/repository";

/**
 * The eight tables, in the order `import` must clear-then-load them: parents
 * before children so an insert never references a not-yet-loaded row (accounts →
 * categories → issuers → rules → transactions → subscriptions → settings →
 * appSettings). There are no DB-level foreign keys (inventory §3), so this order
 * is a faithful-port convention rather than a hard constraint — but it matches
 * the old export/import and keeps the load deterministic.
 */
const TABLES = [
	"accounts",
	"categories",
	"issuers",
	"rules",
	"transactions",
	"subscriptions",
	"settings",
	"appSettings",
] as const;

/**
 * Row encoders — fold an entity into the exact stored row shape (id preserved,
 * dates as ISO TEXT, optionals null-mapped, booleans 0/1, JSON blobs stringified).
 * The four resources with a bespoke row transform reuse it (single source of the
 * storage mapping); the four whose row shape equals the entity's *encoded* shape
 * (accounts, categories, settings, appSettings) encode the entity schema directly.
 */
const toAccountRow = Schema.encodeSync(Account);
const toCategoryRow = Schema.encodeSync(Category);
const toSettingRow = Schema.encodeSync(Setting);
const toIssuerRow = Schema.encodeSync(IssuerFromRow);
const toRuleRow = Schema.encodeSync(RuleFromRow);
const toTransactionRow = Schema.encodeSync(TransactionFromRow);
const toSubscriptionRow = Schema.encodeSync(SubscriptionFromRow);
const toAppSettingsRow = Schema.encodeSync(AppSettings);

/**
 * The database repository — whole-DB backup / restore / reset, on the generic
 * `SqlClient.SqlClient` tag (so it runs unchanged against the Bun prod client and
 * the `:memory:` test client).
 *
 * - `exportAll` reads every table into a `DbDump` (each read decodes through the
 *   resource's own row transform, so the dump is the wire entity shape).
 * - `reset` wipes all 8 tables.
 * - `import` is a **destructive clear-then-load in one transaction**: wipe every
 *   table, then re-insert the supplied rows **with their ids preserved** so an
 *   export → reset → import round-trip is exact. A table absent from the payload
 *   is still wiped (faithful — import is a replace, not a merge). A `SqlError`
 *   isn't client-actionable → dies as a 500 ({@link orDieSql}).
 */
export class DatabaseRepo extends Effect.Service<DatabaseRepo>()(
	"api/DatabaseRepo",
	{
		effect: Effect.gen(function* () {
			const sql = yield* SqlClient.SqlClient;

			// Each read decodes rows through the resource's row schema/transform, so
			// the dump holds fully-decoded wire entities (dates as `Date`, optionals
			// folded, JSON parsed) — the same shapes every list endpoint returns.
			const readAll = <A, I>(table: string, schema: Schema.Schema<A, I>) =>
				sql`SELECT * FROM ${sql(table)}`.pipe(
					Effect.flatMap(Schema.decodeUnknown(Schema.Array(schema))),
				);

			const exportAll = () =>
				Effect.all({
					accounts: readAll("accounts", Account),
					transactions: readAll("transactions", TransactionFromRow),
					issuers: readAll("issuers", IssuerFromRow),
					rules: readAll("rules", RuleFromRow),
					categories: readAll("categories", Category),
					subscriptions: readAll("subscriptions", SubscriptionFromRow),
					settings: readAll("settings", Setting),
					appSettings: readAll("appSettings", AppSettings),
				}).pipe(orDieSql);

			// Wipe every table. Used by `reset` directly and by `import` (inside its
			// transaction) as the "clear" half of clear-then-load.
			const clearAll = Effect.forEach(
				TABLES,
				(table) => sql`DELETE FROM ${sql(table)}`,
				{ discard: true },
			);

			const reset = () =>
				clearAll.pipe(Effect.as({ ok: true as const }), orDieSql);

			// Insert one row with its id preserved (`sql.insert` includes the id
			// column). Empty batches run no statement.
			const insertRows = (
				table: string,
				rows: ReadonlyArray<Record<string, unknown>>,
			): Effect.Effect<void, never, never> =>
				Effect.forEach(
					rows,
					(row) => sql`INSERT INTO ${sql(table)} ${sql.insert(row)}`,
					{ discard: true },
				).pipe(orDieSql);

			const importDump = (dump: DbImport) => {
				// The load plan in dependency order: parents before children (see
				// TABLES). Each entity is folded back to its stored row (id preserved)
				// before insert. An absent table contributes no rows but is still wiped
				// by `clearAll`. `appSettings` is a 0- or 1-element array (the singleton).
				// `.map((x) => enc(x))`, not `.map(enc)`: `Schema.encodeSync`'s second
				// parameter is `ParseOptions`, so passing it straight to `.map` would
				// forward the element index into it.
				const plan: ReadonlyArray<{
					table: string;
					rows: ReadonlyArray<Record<string, unknown>>;
				}> = [
					{
						table: "accounts",
						rows: (dump.accounts ?? []).map((x) => toAccountRow(x)),
					},
					{
						table: "categories",
						rows: (dump.categories ?? []).map((x) => toCategoryRow(x)),
					},
					{
						table: "issuers",
						rows: (dump.issuers ?? []).map((x) => toIssuerRow(x)),
					},
					{ table: "rules", rows: (dump.rules ?? []).map((x) => toRuleRow(x)) },
					{
						table: "transactions",
						rows: (dump.transactions ?? []).map((x) => toTransactionRow(x)),
					},
					{
						table: "subscriptions",
						rows: (dump.subscriptions ?? []).map((x) => toSubscriptionRow(x)),
					},
					{
						table: "settings",
						rows: (dump.settings ?? []).map((x) => toSettingRow(x)),
					},
					{
						table: "appSettings",
						rows: (dump.appSettings ?? []).map((x) => toAppSettingsRow(x)),
					},
				];

				return sql
					.withTransaction(
						clearAll.pipe(
							Effect.andThen(
								Effect.forEach(
									plan,
									({ table, rows }) => insertRows(table, rows),
									{
										discard: true,
									},
								),
							),
						),
					)
					.pipe(Effect.as({ ok: true as const }), orDieSql);
			};

			return { exportAll, reset, import: importDump } as const;
		}),
	},
) {}

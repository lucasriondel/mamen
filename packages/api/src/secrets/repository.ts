import { SqlClient } from "@effect/sql";
import {
	SECRET_MIN_LENGTH,
	type SecretName,
	SecretRejected,
	SecretStatus,
} from "@mamen/shared/contract";
import { Clock, Effect, Option, Redacted } from "effect";
import { TokenEncryptionKey } from "../config";
import {
	decrypt,
	type EncryptionKey,
	encrypt,
	keyFromHex,
} from "../crypto/aes-gcm";
import { orDieSql } from "../db/errors";
import { maskSecret } from "./mask";

/**
 * The secrets repository — **the only module that decrypts** (issue #117, ADR
 * 0011). The boundary this file exists to draw is absolute, and it is drawn
 * here so it can be audited by reading one file:
 *
 * - **outward** — {@link SecretsRepo}, whose every method answers with a
 *   `SecretStatus`: a boolean and a masked hint. It cannot return a secret,
 *   because it has no method that returns one.
 * - **inward** — {@link readSecret}, the plaintext reader, for in-process
 *   callers only. It is deliberately **not** re-exported from `secrets/index.ts`
 *   (the module's barrel), so reaching it takes a deep import that says what it
 *   is doing, and `secrets/boundary.test.ts` holds that.
 *
 * Nothing here logs a secret or puts one in an error: a rejected paste is
 * described by a **reason code**, and the plaintext reader hands back
 * `Redacted`, so even an accidental `Effect.log` of it prints `<redacted>`.
 */

/** The one row shape this table has; only the ciphertext is ever read. */
type SecretRow = { readonly ciphertext: string };

const findCiphertext = (
	sql: SqlClient.SqlClient,
	name: SecretName,
): Effect.Effect<Option.Option<string>> =>
	sql<SecretRow>`SELECT ciphertext FROM encrypted_secrets WHERE name = ${name}`.pipe(
		orDieSql,
		Effect.map((rows) => Option.fromNullable(rows[0]?.ciphertext)),
	);

/**
 * The configured key, parsed. `none` covers unset, blank and malformed alike —
 * all three are the same operational fact (there is no usable key), and telling
 * them apart would mean a message that describes the key.
 */
const encryptionKey: Effect.Effect<Option.Option<EncryptionKey>> =
	TokenEncryptionKey.pipe(
		// A `Config.option` read only fails on a broken ConfigProvider, which is
		// infrastructure, not this module's to describe.
		Effect.orDie,
		Effect.map(
			Option.flatMap((redacted) => keyFromHex(Redacted.value(redacted).trim())),
		),
	);

/**
 * The plaintext behind a stored name, or `none` — which means *either* nothing
 * is stored *or* what is stored will not decrypt. Callers that must tell those
 * apart (only `status` does) look the row up themselves.
 */
const decryptStored = (
	ciphertext: string,
): Effect.Effect<Option.Option<string>> =>
	Effect.map(
		encryptionKey,
		Option.flatMap((key) => decrypt(ciphertext, key)),
	);

/**
 * The **inward** reader: the stored credential itself, for an in-process caller
 * that is about to spend it at a vendor. `Redacted`, so it cannot be printed by
 * accident, and `Option.none` for every unreadable state — a caller must handle
 * "no usable credential" and is given nothing to distinguish the reasons, which
 * are the operator's problem and are told through `status`.
 *
 * Requires only `SqlClient`, so it is callable from any in-process service
 * without dragging the HTTP layer in — and is not on the barrel.
 */
export const readSecret = (
	name: SecretName,
): Effect.Effect<
	Option.Option<Redacted.Redacted<string>>,
	never,
	SqlClient.SqlClient
> =>
	Effect.flatMap(SqlClient.SqlClient, (sql) =>
		findCiphertext(sql, name).pipe(
			Effect.flatMap(
				Option.match({
					onNone: () => Effect.succeedNone,
					onSome: decryptStored,
				}),
			),
			Effect.map(Option.map(Redacted.make)),
		),
	);

/**
 * The **outward** surface: store, read the status of, and clear one encrypted
 * credential. Depends only on the generic `SqlClient.SqlClient` tag, so it runs
 * unchanged against the Bun production client and the `:memory:` test client.
 */
export class SecretsRepo extends Effect.Service<SecretsRepo>()(
	"api/SecretsRepo",
	{
		effect: Effect.gen(function* () {
			const sql = yield* SqlClient.SqlClient;

			const nowIso = Clock.currentTimeMillis.pipe(
				Effect.map((millis) => new Date(millis).toISOString()),
			);

			/**
			 * A row exists → configured. Decryptable → its hint; not → `null`.
			 * *Present but unreadable* is the state a rotated key produces, and
			 * reporting it as absent would tell the operator nothing was ever
			 * stored, so they would never think to re-paste.
			 */
			const status = (name: SecretName): Effect.Effect<SecretStatus> =>
				findCiphertext(sql, name).pipe(
					Effect.flatMap(
						Option.match({
							onNone: () =>
								Effect.succeed(
									new SecretStatus({ name, configured: false, hint: null }),
								),
							onSome: (ciphertext) =>
								decryptStored(ciphertext).pipe(
									Effect.map(
										(plaintext) =>
											new SecretStatus({
												name,
												configured: true,
												hint: Option.match(plaintext, {
													onNone: () => null,
													onSome: maskSecret,
												}),
											}),
									),
								),
						}),
					),
				);

			/**
			 * Store a pasted credential, replacing whatever was there (the rotation
			 * path). The value is trimmed first — a copy off a vendor dashboard
			 * routinely carries whitespace, and stored as-is it silently becomes
			 * part of the credential.
			 *
			 * The returned status is derived from what was just stored rather than
			 * by re-reading it: a re-read would be a second decrypt for no new
			 * information.
			 */
			const put = (
				name: SecretName,
				value: string,
			): Effect.Effect<SecretStatus, SecretRejected> =>
				Effect.gen(function* () {
					const trimmed = value.trim();
					if (trimmed.length === 0) {
						return yield* Effect.fail(new SecretRejected({ reason: "blank" }));
					}
					if (trimmed.length < SECRET_MIN_LENGTH) {
						return yield* Effect.fail(
							new SecretRejected({ reason: "too-short" }),
						);
					}

					const key = yield* encryptionKey;
					if (Option.isNone(key)) {
						// A deployment without a usable key cannot store a credential.
						// It dies as an untyped 500 rather than becoming a client-visible
						// error: nothing the caller does fixes it, and the message names
						// the variable, never a value.
						return yield* Effect.die(
							new Error(
								"TOKEN_ENCRYPTION_KEY is unset or is not 64 hex characters",
							),
						);
					}

					const updatedAt = yield* nowIso;
					yield* sql`INSERT OR REPLACE INTO encrypted_secrets ${sql.insert({
						name,
						ciphertext: encrypt(trimmed, key.value),
						updatedAt,
					})}`.pipe(orDieSql);

					return new SecretStatus({
						name,
						configured: true,
						hint: maskSecret(trimmed),
					});
				});

			/**
			 * Clear a stored credential. **Idempotent**: clearing one that was never
			 * stored is not an error — the caller asked for "no credential here",
			 * and that holds either way — so this returns the absent status rather
			 * than a `NotFound`.
			 */
			const clear = (name: SecretName): Effect.Effect<SecretStatus> =>
				sql`DELETE FROM encrypted_secrets WHERE name = ${name}`.pipe(
					orDieSql,
					Effect.as(new SecretStatus({ name, configured: false, hint: null })),
				);

			return { status, put, clear } as const;
		}),
	},
) {}

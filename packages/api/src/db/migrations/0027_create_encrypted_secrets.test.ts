import { SqlClient } from "@effect/sql";
import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";
import { DatabaseTest } from "../test";

/**
 * `encrypted_secrets` (issue #117) — the table credentials live in, one row per
 * secret, keyed by **name**.
 *
 * Two properties are worth a test rather than a reading of the DDL, because both
 * are load-bearing for behaviour the repository above relies on:
 *
 * - the key is the *name*, so pasting over a stored credential replaces it. A
 *   surrogate id would let two rows claim the same name and make "which key is
 *   stored" a question with two answers.
 * - the ciphertext column is NOT NULL, so there is no such thing as a row that
 *   claims a secret is configured while holding nothing.
 */
describe("0027 encrypted_secrets", () => {
	it.effect("keys a secret by name — a second write replaces the first", () =>
		Effect.gen(function* () {
			const sql = yield* SqlClient.SqlClient;
			yield* sql`INSERT OR REPLACE INTO encrypted_secrets (name, ciphertext, updatedAt) VALUES ('anthropic', 'first', '2026-08-16T00:00:00.000Z')`;
			yield* sql`INSERT OR REPLACE INTO encrypted_secrets (name, ciphertext, updatedAt) VALUES ('anthropic', 'second', '2026-08-16T00:01:00.000Z')`;

			const rows = yield* sql<{
				name: string;
				ciphertext: string;
			}>`SELECT name, ciphertext FROM encrypted_secrets`;

			assert.deepStrictEqual(
				rows.map((row) => [row.name, row.ciphertext]),
				[["anthropic", "second"]],
			);
		}).pipe(Effect.provide(DatabaseTest)),
	);

	it.effect("refuses a row with no ciphertext", () =>
		Effect.gen(function* () {
			const sql = yield* SqlClient.SqlClient;
			const error =
				yield* sql`INSERT INTO encrypted_secrets (name, ciphertext, updatedAt) VALUES ('anthropic', NULL, '2026-08-16T00:00:00.000Z')`.pipe(
					Effect.flip,
				);

			assert.include(String(error.cause ?? error.message), "NOT NULL");
		}).pipe(Effect.provide(DatabaseTest)),
	);
});

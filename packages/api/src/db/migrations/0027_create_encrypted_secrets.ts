import { SqlClient } from "@effect/sql";
import { Effect } from "effect";

/**
 * Creates `encrypted_secrets` (issue #117, ADR 0011) — where a pasted vendor
 * credential lives, as ciphertext.
 *
 * **Name-keyed, one row per secret.** The name is the primary key rather than a
 * surrogate id, so pasting over a stored credential *replaces* it
 * (`INSERT OR REPLACE`) and "is a key stored for this provider" has exactly one
 * answer. A key is issued per vendor and shared by every task that vendor runs,
 * so there is nothing finer to key on.
 *
 * **Only the ciphertext is stored** — no plaintext column, no masked hint
 * column. The hint is derived on read from the decrypted value, which is what
 * makes a blob written under a rotated `TOKEN_ENCRYPTION_KEY` report as
 * *present but unreadable*: a stored hint would keep answering after the value
 * behind it had become unreadable, which is the one failure mode the operator
 * most needs told plainly. `ciphertext` is NOT NULL for the same reason — a row
 * asserts that a secret exists, so a row holding nothing is a contradiction.
 *
 * `updatedAt` is when the credential was last pasted; nothing reads it yet, and
 * it is here because "when did I last rotate this" is the one question about a
 * stored key that the key itself cannot answer.
 *
 * No `TEXT` length limit and no format constraint: the column holds base64 of
 * `iv ‖ tag ‖ ciphertext` (see `crypto/aes-gcm.ts`), whose framing is the
 * crypto module's business and not the schema's.
 */
export default Effect.flatMap(SqlClient.SqlClient, (sql) =>
	sql`CREATE TABLE IF NOT EXISTS encrypted_secrets (
			name TEXT PRIMARY KEY,
			ciphertext TEXT NOT NULL,
			updatedAt TEXT NOT NULL
		)`.pipe(Effect.asVoid),
);

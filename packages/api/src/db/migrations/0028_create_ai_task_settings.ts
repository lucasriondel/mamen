import { SqlClient } from "@effect/sql";
import { Effect } from "effect";

/**
 * Creates `ai_task_settings` (issue #119, PRD #115) — which **AI provider** and
 * model each **AI task** runs on.
 *
 * **Task-keyed, one row per task.** A task runs on exactly one provider at a
 * time, so the task is the primary key rather than a surrogate id: saving a
 * choice replaces it (`INSERT OR REPLACE`), and "what runs the extraction" has
 * exactly one answer.
 *
 * **The table starts empty, and stays empty until the user chooses.** An absent
 * row means *the default* — `claude-code` on the cheap head of its model list —
 * read from the catalogue at the moment it is asked for. Seeding the defaults
 * here would freeze today's default into a stored row, so moving it later would
 * become a data migration rather than a one-line edit in `contract/ai.ts`, and a
 * fresh install would carry a "choice" nobody made.
 *
 * `provider` and `model` are both NOT NULL: a row asserts *this task runs on
 * that*, and a row holding half of that is a choice nothing can act on. Neither
 * is constrained to the catalogue's values — sqlite would need a CHECK listing
 * them, which is the catalogue written a second time in a place a migration
 * cannot keep in step. A row naming a provider the catalogue no longer carries
 * is refused where it is read, not where it is stored.
 *
 * `updatedAt` is when the choice was last saved; nothing reads it yet, and it is
 * here for the same reason `encrypted_secrets` carries one — "when did this
 * change" is the question a row cannot answer about itself.
 */
export default Effect.flatMap(SqlClient.SqlClient, (sql) =>
  sql`CREATE TABLE IF NOT EXISTS ai_task_settings (
			task TEXT PRIMARY KEY,
			provider TEXT NOT NULL,
			model TEXT NOT NULL,
			updatedAt TEXT NOT NULL
		)`.pipe(Effect.asVoid),
);

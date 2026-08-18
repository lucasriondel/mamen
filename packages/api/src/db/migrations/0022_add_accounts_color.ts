import { SqlClient } from "@effect/sql";
import { Effect } from "effect";

/**
 * Adds `accounts.color` — the badge colour the transactions table paints for an
 * account, editable from the accounts page.
 *
 * `TEXT` with no default, so **nothing is backfilled**: existing accounts read
 * as null, and null means *auto* rather than *absent*. Unlike `categories.color`
 * (migration 0015), null cannot mean "inherit" here — accounts are a flat list
 * with no ancestor to inherit from — so the web resolves a null against a fixed
 * palette keyed by the account's `id`. That is what makes the no-backfill choice
 * safe: every pre-existing account paints a stable, distinct badge on the first
 * render, without this migration having to invent a colour per row and without
 * the user having to open a picker for the feature to do anything.
 *
 * The stored value is a normalised lower-case hex string (`#rgb` or `#rrggbb`),
 * validated at the picker rather than in the column: sqlite has no CHECK worth
 * writing for it, and the contract types it as a bare nullable string.
 *
 * No index — colour is display-only, never a filter or join key.
 */
export default Effect.flatMap(SqlClient.SqlClient, (sql) =>
  sql`ALTER TABLE accounts ADD COLUMN color TEXT`.pipe(Effect.asVoid),
);

import type { SqlError } from "@effect/sql/SqlError";
import { Conflict } from "@mamen/shared/contract";
import { Effect } from "effect";

/**
 * The service-boundary rule for `@effect/sql` failures (error taxonomy §3):
 * a `SqlError` **never crosses the wire as itself** (it carries raw SQL / column
 * names). A UNIQUE-constraint violation becomes a typed `Conflict (409)`;
 * everything else (connection lost, malformed query = a bug) dies as an untyped
 * 500 with no DB detail leaked.
 *
 * sqlite reports uniqueness violations with a message containing
 * "UNIQUE constraint failed".
 */
const isUniqueViolation = (error: SqlError): boolean =>
	/unique constraint failed/i.test(String(error.cause ?? error.message ?? ""));

/**
 * Wrap a write that can hit a UNIQUE constraint: maps the violation to
 * `Conflict`, dies on any other `SqlError`. Ports with a unique field (settings
 * key, merchant name, …) pipe their inserts/updates through this. Accounts has
 * no unique field, so it uses {@link orDieSql} instead — this is the shared
 * pattern the map's SqlError boundary rule refers to.
 */
export const conflictOrDie =
	(resource: string) =>
	<A, R>(
		effect: Effect.Effect<A, SqlError, R>,
	): Effect.Effect<A, Conflict, R> =>
		effect.pipe(
			Effect.catchTag("SqlError", (error) =>
				isUniqueViolation(error)
					? Effect.fail(
							new Conflict({
								resource,
								message: "A record with these values already exists.",
							}),
						)
					: Effect.die(error),
			),
		);

/**
 * Turn an infrastructure failure into an untyped defect (500). Used for writes
 * on resources with no uniqueness constraint (e.g. accounts): a `SqlError` isn't
 * client-actionable, and a `ParseError` decoding a `RETURNING *` row is a bug —
 * both die rather than leak. Only the typed domain errors (`NotFound`) reach the
 * wire. This is a thin alias for `Effect.orDie` named for the boundary intent.
 */
export const orDieSql: <A, E, R>(
	effect: Effect.Effect<A, E, R>,
) => Effect.Effect<A, never, R> = Effect.orDie;

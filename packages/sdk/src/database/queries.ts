import type { DbDump, DbImport } from "@mamen/shared/contract";
import { Effect } from "effect";
import { Client, runQuery } from "../runtime";

/**
 * Mutation functions for the database backup / restore / reset ops. Returned as
 * plain `mutationFn`s (not wired to a specific `QueryClient`) so the caller owns
 * invalidation — the SDK stays invalidation-agnostic. All three are destructive
 * or state-changing whole-DB ops; invalidate the entire query cache after
 * `reset` / `import` (every resource may have changed).
 *
 * `export` is modeled as a mutation (not a query) because the contract endpoint
 * is `POST` (contract decision #6 — a whole-DB dump is not a cacheable GET) and
 * the caller persists the returned JSON itself rather than caching it.
 */
export const databaseMutations = {
  reset: () => runQuery(Effect.flatMap(Client, (client) => client.database.reset())),

  export: (): Promise<DbDump> =>
    runQuery(Effect.flatMap(Client, (client) => client.database.export())),

  import: (dump: DbImport) =>
    runQuery(Effect.flatMap(Client, (client) => client.database.import({ payload: dump }))),
};

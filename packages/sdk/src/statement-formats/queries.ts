import type {
  AccountId,
  StatementFormatCreate,
  StatementFormatId,
  StatementFormatUpdate,
} from "@mamen/shared/contract";
import { PaginationDefaults } from "@mamen/shared/contract";
import { queryOptions } from "@tanstack/react-query";
import { Effect } from "effect";
import { Client, runQuery } from "../runtime";

/** `list` params: the standard page window plus the account scope. */
export type StatementFormatListParams = {
  limit?: number;
  offset?: number;
  accountId?: AccountId;
};

/**
 * Query-key factory for the statement-formats resource. `byAccount` is the key
 * every surface actually uses — a **Statement Format** belongs to one account,
 * so the picker asks for one account's formats and nothing else.
 */
export const statementFormatKeys = {
  all: ["statement-formats"] as const,
  lists: () => [...statementFormatKeys.all, "list"] as const,
  list: (params: StatementFormatListParams) => [...statementFormatKeys.lists(), params] as const,
  details: () => [...statementFormatKeys.all, "detail"] as const,
  detail: (id: StatementFormatId) => [...statementFormatKeys.details(), id] as const,
};

/** tanstack-query read options for the statement-formats resource. */
export const statementFormatQueries = {
  list: (params: StatementFormatListParams = {}) => {
    const urlParams = { ...PaginationDefaults, ...params };
    return queryOptions({
      queryKey: statementFormatKeys.list(urlParams),
      queryFn: ({ signal }) =>
        runQuery(
          Effect.flatMap(Client, (client) => client.statementFormats.list({ urlParams })),
          signal,
        ),
    });
  },

  getById: (id: StatementFormatId) =>
    queryOptions({
      queryKey: statementFormatKeys.detail(id),
      queryFn: ({ signal }) =>
        runQuery(
          Effect.flatMap(Client, (client) => client.statementFormats.getById({ path: { id } })),
          signal,
        ),
    }),
};

/**
 * Mutation functions for the statement-formats resource: `create`, `update` (a
 * rename, and only that — a bank that changes its export gets a new record, so
 * the statements downloaded before the change keep one that reads them) and
 * `remove` (a hard delete; the transactions imported under a format hold no
 * reference to it, so nothing is orphaned by its going).
 *
 * Returned as plain `mutationFn`s — the caller owns invalidation. Invalidate
 * `statementFormatKeys.all` after a write.
 */
export const statementFormatMutations = {
  create: (payload: StatementFormatCreate) =>
    runQuery(
      Effect.flatMap(Client, (client) =>
        // The derived client's parameter type distributes over the payload
        // union, and `{ payload: Csv | Pdf }` is not assignable to
        // `{ payload: Csv } | { payload: Pdf }` — so the discriminant is read
        // once more here to pick the branch. Two identical-looking calls, two
        // different instantiations.
        payload.kind === "csv"
          ? client.statementFormats.create({ payload })
          : client.statementFormats.create({ payload }),
      ),
    ),

  update: (id: StatementFormatId, payload: StatementFormatUpdate) =>
    runQuery(
      Effect.flatMap(Client, (client) => client.statementFormats.update({ path: { id }, payload })),
    ),

  remove: (id: StatementFormatId) =>
    runQuery(Effect.flatMap(Client, (client) => client.statementFormats.remove({ path: { id } }))),
};

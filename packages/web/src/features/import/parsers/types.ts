import type { AccountId, TransactionCreate } from "@mamen/shared/contract";

/**
 * A parsed transaction ready to be written — the SDK's {@link TransactionCreate}
 * shape minus the server-stamped `importedAt` (added at commit time). A pure
 * parser produces these from raw CSV rows; it never touches the network.
 */
export type ParsedTransaction = Omit<TransactionCreate, "importedAt">;

/**
 * The context a parser needs but the file can't supply: the target account the
 * statement belongs to and the id grouping every row of one import together.
 */
export type ParseContext = {
  accountId: AccountId;
  importBatchId: string;
};

/**
 * One record and the raw row it was read from. A parser drops the rows it won't
 * import (a non-`COMPLETE` `Statut`, say), so a record's place in the output says
 * nothing about its row's — and the wizard mints its **stable row ids** against
 * the raw rows, before any parser has seen them. Reporting the source row is what
 * joins the two: without it the preview would put one row's id on another row's
 * record and a skip would hold out the wrong one (issue #192).
 */
export type ParsedRow = {
  /** Index into the rows handed to `parse` — the row this record was read from. */
  sourceIndex: number;
  record: ParsedTransaction;
};

/**
 * A pluggable statement parser (per ADR 0001). The registry parses the file once
 * with papaparse, then picks a parser by header {@link StatementParser.matches}
 * fingerprint. `parse` is a pure row→record function: no file I/O, no network.
 */
export type StatementParser = {
  /** Stable identifier used by the manual format picker and tests. */
  id: string;
  /** Human label for the format (e.g. shown in the picker). */
  label: string;
  /** Header fingerprint — `true` when this parser recognizes the file. */
  matches: (headers: readonly string[]) => boolean;
  /**
   * Turn raw CSV rows (header-keyed objects) into records for the account, each
   * naming the row it came from. Rows the format doesn't import are simply absent
   * from the output.
   */
  parse: (rows: ReadonlyArray<Record<string, string>>, ctx: ParseContext) => ParsedRow[];
};

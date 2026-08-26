import type {
  DiscoverPdfResult,
  ExtractPdfResult,
  StatementFormatId,
} from "@mamen/shared/contract";
import { Effect } from "effect";
import { Client, runQuery } from "../runtime";

/**
 * Mutation functions for the import resource. Returned as plain `mutationFn`s
 * (not wired to a specific `QueryClient`); PDF extraction writes nothing to the
 * database (ADR 0005), so there is no cache to invalidate — the caller threads
 * the returned candidates into the existing commit flow (issue #45).
 *
 * `extractPdf` builds the `FormData` internally so web callers pass a `File` and
 * the id of the **Statement Format** to read it with (mirroring
 * `issuerMutations.uploadImage` — the contract types the payload as `FormData`,
 * here under the field keys `file` and `formatId`). The format is required since
 * issue #185: it is what tells the model which columns the statement carries, so
 * there is no call that omits it and no default for it to fall back on.
 *
 * It resolves to the extracted transactions, the statement's declared totals and
 * the **format verdict** — whether the statement actually carried the columns
 * that format declares, and which it did not (issue #188). A mismatch resolves
 * like any other answer rather than rejecting: nothing failed, and the caller
 * branches on it. It rejects only with a contract tagged error: `InvalidFileType`, `NotFound`
 * (no PDF format under that id), the collapsed `ExtractionFailed`, or
 * `AiProviderNotConfigured` — the one a caller can act on, which is why it is its
 * own tag and not folded into the collapse (issue #122).
 *
 * `discoverPdf` (issue #217, PRD #216) is the **first PDF import**: the account
 * has no **Statement Format**, so it takes the file and nothing else and
 * resolves to the statement's table as printed — the bank's own columns, string
 * cells, the declared totals, and no format verdict. A mutation rather than a
 * query for the same reason `extractPdf` is one: it costs an AI run, so it must
 * happen because the user asked for it, never because a component mounted. It
 * writes nothing either, so again there is no cache to invalidate.
 *
 * It rejects with `InvalidFileType`, `NoTransactionTable` (the file carries no
 * transaction table — the one failure that is about the *file* rather than about
 * the run), the collapsed `ExtractionFailed`, or `AiProviderNotConfigured`. No
 * `NotFound`: there is no format to name, which is the point of it.
 */
export const importMutations = {
  extractPdf: (file: File, formatId: StatementFormatId): Promise<ExtractPdfResult> => {
    const payload = new FormData();
    payload.append("file", file);
    payload.append("formatId", String(formatId));
    return runQuery(Effect.flatMap(Client, (client) => client.import.extractPdf({ payload })));
  },
  discoverPdf: (file: File): Promise<DiscoverPdfResult> => {
    const payload = new FormData();
    payload.append("file", file);
    return runQuery(Effect.flatMap(Client, (client) => client.import.discoverPdf({ payload })));
  },
};

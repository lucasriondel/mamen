import type { ExtractPdfResult, StatementFormatId } from "@mamen/shared/contract";
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
 * It resolves to the extracted transactions plus the statement's declared
 * totals, or rejects with a contract tagged error: `InvalidFileType`, `NotFound`
 * (no PDF format under that id), the collapsed `ExtractionFailed`, or
 * `AiProviderNotConfigured` — the one a caller can act on, which is why it is its
 * own tag and not folded into the collapse (issue #122).
 */
export const importMutations = {
  extractPdf: (file: File, formatId: StatementFormatId): Promise<ExtractPdfResult> => {
    const payload = new FormData();
    payload.append("file", file);
    payload.append("formatId", String(formatId));
    return runQuery(Effect.flatMap(Client, (client) => client.import.extractPdf({ payload })));
  },
};

import type { ExtractPdfResult } from "@mamen/shared/contract";
import { Effect } from "effect";
import { Client, runQuery } from "../runtime";

/**
 * Mutation functions for the import resource. Returned as plain `mutationFn`s
 * (not wired to a specific `QueryClient`); PDF extraction writes nothing to the
 * database (ADR 0005), so there is no cache to invalidate — the caller threads
 * the returned candidates into the existing commit flow (issue #45).
 *
 * `extractPdf` builds the `FormData` internally so web callers pass just a
 * `File` (mirroring `issuerMutations.uploadImage` — the contract types the
 * payload as `FormData` under the field key `file`). It resolves to the
 * extracted transactions plus the statement's declared totals, or rejects with
 * a contract tagged error (`InvalidFileType` / `ExtractionFailed`).
 */
export const importMutations = {
	extractPdf: (file: File): Promise<ExtractPdfResult> => {
		const payload = new FormData();
		payload.append("file", file);
		return runQuery(
			Effect.flatMap(Client, (client) => client.import.extractPdf({ payload })),
		);
	},
};

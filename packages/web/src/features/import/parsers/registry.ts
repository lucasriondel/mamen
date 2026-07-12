import { greenGotParser } from "./green-got";
import type { StatementParser } from "./types";

/**
 * The pluggable parser registry (per ADR 0001). The import flow parses the file
 * once with papaparse, then asks {@link detectParser} to pick a parser by header
 * fingerprint. New banks are added by appending a {@link StatementParser} here.
 */
export const PARSERS: readonly StatementParser[] = [greenGotParser];

/**
 * Auto-detect the parser for a file from its headers. Returns the sole matching
 * parser, or `null` when zero or more than one parser matches — the ambiguous
 * cases where the user must pick the format manually.
 */
export function detectParser(
	headers: readonly string[],
): StatementParser | null {
	const matches = PARSERS.filter((parser) => parser.matches(headers));
	return matches.length === 1 ? matches[0] : null;
}

/** Look up a parser by its stable `id` (used by the manual format picker). */
export function getParserById(id: string): StatementParser | undefined {
	return PARSERS.find((parser) => parser.id === id);
}

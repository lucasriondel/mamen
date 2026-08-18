import Papa from "papaparse";

/** A CSV parsed once into its header list + header-keyed rows. */
export type ParsedCsv = {
  headers: string[];
  rows: Record<string, string>[];
};

/**
 * Parse a dropped CSV `File` entirely in the browser (per ADR 0001) into headers
 * + rows. The file is read once here; parsers downstream are pure row→record
 * functions that never touch I/O. Rejects on a fatal papaparse error.
 */
export function parseCsvFile(file: File): Promise<ParsedCsv> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => resolve({ headers: result.meta.fields ?? [], rows: result.data }),
      error: (error: unknown) => reject(error),
    });
  });
}

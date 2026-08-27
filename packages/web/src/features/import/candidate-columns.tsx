import type { ColumnHelper } from "@tanstack/react-table";
import type { ReactNode } from "react";
import { AlreadyImportedMark } from "./already-imported-mark";
import { type PreviewColumn, SkippedNote } from "./candidate-table";
import type { CandidateRow } from "./candidate-rows";

/**
 * The three columns both import previews show, and the one place their shape is
 * decided: **Date**, **Raw issuer**, **Amount**, in that order, behind the shared
 * skip checkbox.
 *
 * The two paths declared these separately with the same ids, the same headers and
 * the same right-aligned sign-coloured amount — which is what a test asserting
 * `["", "Date", "Raw issuer", "Amount"]` on *both* tables was quietly holding
 * together by hand. What differs between them is only what a cell *is*: the CSV
 * preview renders values (a file said what it said), the **side-by-side
 * validation** view renders inputs (a model's reading can be wrong). So the cell
 * body is the caller's and everything around it — id, header, alignment, the
 * accessor the facets and the filters read — is here.
 *
 * Each builder takes the caller's own `columnHelper`, because the candidate row's
 * payload type differs by path (`ParsedTransaction` against
 * `ExtractedTransaction`) and the helper is what carries that type through the
 * accessor into the cell.
 */

/** The class an amount wears: right-aligned, tabular, and coloured by its sign. */
export function amountToneClass(amount: number): string {
  return `block text-right tabular-nums ${amount < 0 ? "text-gousse-high" : "text-gousse-low"}`;
}

/** The **Date** column — the accessor is shared, the cell is the path's own. */
export function dateColumn<T extends { date: Date }>(
  columnHelper: ColumnHelper<CandidateRow<T>>,
  cell: (candidate: CandidateRow<T>, isSkipped: boolean) => ReactNode,
): PreviewColumn<T> {
  return columnHelper.accessor((candidate) => candidate.row.date, {
    id: "date",
    header: "Date",
    cell: ({ row }) => cell(row.original, !row.getIsSelected()),
  });
}

/**
 * The **Raw issuer** column — the operation label, and the two marks that hang
 * off it.
 *
 * The marks are here rather than in either cell body because they are the same
 * claim about the same row on both paths: **already imported** (issue #89) and
 * **skipped** (epic #85) must not be able to read one way in one preview and
 * another way in the other. What the caller supplies is the label itself, which
 * is a value on one path and an input on the other; how it is laid out beside the
 * marks is the caller's too, since a value sits inline with them and an input
 * stacks above them.
 */
export function rawIssuerColumn<T extends { rawIssuerString: string }>(
  columnHelper: ColumnHelper<CandidateRow<T>>,
  cell: (candidate: CandidateRow<T>, isSkipped: boolean, marks: ReactNode) => ReactNode,
): PreviewColumn<T> {
  return columnHelper.accessor((candidate) => candidate.row.rawIssuerString, {
    id: "rawIssuer",
    header: "Raw issuer",
    cell: ({ row }) => {
      const isSkipped = !row.getIsSelected();
      return cell(
        row.original,
        isSkipped,
        <>
          {row.original.duplicate ? <AlreadyImportedMark /> : null}
          {isSkipped ? <SkippedNote /> : null}
        </>,
      );
    },
  });
}

/** The **Amount** column — right-aligned in its header as well as its cells. */
export function amountColumn<T extends { amount: number }>(
  columnHelper: ColumnHelper<CandidateRow<T>>,
  cell: (candidate: CandidateRow<T>, isSkipped: boolean) => ReactNode,
): PreviewColumn<T> {
  return columnHelper.accessor((candidate) => candidate.row.amount, {
    id: "amount",
    header: () => <span className="block text-right">Amount</span>,
    cell: ({ row }) => cell(row.original, !row.getIsSelected()),
  });
}

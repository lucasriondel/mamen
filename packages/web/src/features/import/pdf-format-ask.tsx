import type { PdfStatementFormat, StatementFormatId } from "@mamen/shared/contract";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Field } from "./field";
import { WizardPanel } from "./wizard-panel";

/**
 * **Which of these formats reads this statement?** — the question a PDF in hand
 * asks whenever the account has formats to offer and none of them is settled.
 *
 * Two situations reach it and they ask the user the same thing. Either the account
 * has several PDF formats and nobody has said which reads this file (issue #185),
 * or one was chosen and extraction reported that the statement does not carry its
 * columns (issue #188). Only the copy differs; the control, the list it offers and
 * what happens on the button are identical, because in both the file is already
 * here and the question is which format reads it.
 *
 * The list stays on the mismatch screen as much as on the ambiguity, since the
 * format that failed is not the only one the account has. And the offer to build a
 * new one sits *beside* it as the secondary action (issue #221): a saved format
 * that reads this statement costs nothing and an AI run does, so building one is
 * what a user reaches for when the list in front of them has nothing.
 */
export function PdfFormatAsk({
  fileName,
  missingColumns,
  formats,
  chosen,
  onChoose,
  onExtract,
  buildOffer,
}: {
  fileName: string | null;
  /**
   * The columns the chosen format declared and the statement did not carry —
   * `null` on the ambiguity, where nothing has failed and nothing is missing.
   */
  missingColumns: readonly string[] | null;
  formats: readonly PdfStatementFormat[];
  chosen: StatementFormatId | null;
  onChoose: (formatId: StatementFormatId | null) => void;
  onExtract: () => void;
  /** The offer to build one instead — the secondary answer to the same question. */
  buildOffer: ReactNode;
}) {
  return (
    <WizardPanel>
      <p className="text-sm text-gousse-muted">
        <span className="font-medium text-gousse-ink">{fileName}</span>
        {missingColumns === null ? (
          <>
            {" "}
            — this account has several PDF statement formats. Which one reads this statement? Or
            build a new one from it.
          </>
        ) : (
          <>
            {" "}
            — that format doesn't read this statement: it carries no{" "}
            <span className="text-gousse-ink">{missingColumns.join(", ")}</span>. Pick the one that
            does, or build a format from this statement — the file is still here either way.
          </>
        )}
      </p>

      <Field label="Format">
        <Select
          value={chosen === null ? "" : String(chosen)}
          onChange={(event) =>
            onChoose(
              event.target.value === "" ? null : (Number(event.target.value) as StatementFormatId),
            )
          }
          aria-label="PDF statement format"
        >
          <option value="" disabled>
            Pick the statement format…
          </option>
          {formats.map((format) => (
            <option key={format.id} value={format.id}>
              {format.name}
            </option>
          ))}
        </Select>
      </Field>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" size="md" disabled={chosen === null} onClick={onExtract}>
          Extract transactions
        </Button>
        {buildOffer}
      </div>
    </WizardPanel>
  );
}

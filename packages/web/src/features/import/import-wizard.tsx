import type { Account, AccountId, StatementFormat } from "@mamen/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { type ReactNode, useEffect, useMemo, useReducer } from "react";
import { PageLayout } from "@/components/page-layout";
import { stepPresence } from "@/lib/motion";
import { accountQueries, statementFormatQueries } from "@/lib/sdk";
import { enrichExtracted } from "./enrich-extracted";
import { takeHandoff } from "./import-handoff";
import { applyFormat } from "./parsers/apply-format";
import { csvFormats, detectFormat } from "./parsers/detect-format";
import type { ParsedTransaction } from "./parsers/types";
import { PdfValidationStep } from "./pdf-validation-step";
import { PreviewStep } from "./preview-step";
import { UploadStep } from "./upload-step";
import {
  makeInitialWizardState,
  type RowId,
  type WizardPrefill,
  wizardReducer,
} from "./wizard-reducer";

/**
 * Assemble the wizard's prefill from a grid handoff: the account chosen on the
 * dropped-on cell, plus the statement the cell already parsed (if any). Read
 * once at mount — `takeHandoff` clears the pending file so a later manual
 * `/import` visit starts clean.
 */
function readPrefill(initialAccountId?: AccountId): WizardPrefill | undefined {
  const handoff = takeHandoff();
  if (initialAccountId === undefined && handoff === null) return undefined;
  return {
    accountId: initialAccountId ?? null,
    // No format on the way in: the account's formats are fetched, and at mount
    // that request has not been made. The handed-off file lands undecided and is
    // detected on the same beat a dropped one is (issue #184).
    ...(handoff
      ? { file: { fileName: handoff.fileName, headers: handoff.headers, rows: handoff.rows } }
      : {}),
  };
}

/**
 * The 3-step import wizard (PRD): (1) target account, then the file drop and its
 * **Statement Format** auto-detect, (2) mandatory preview, (3) commit → toast →
 * navigate. The account leads the step because a format is account-scoped (issue
 * #181). State is local (`useReducer`) — there is no global store. The parsed
 * records are derived from the chosen format + rows so the preview and commit
 * share one source of truth.
 */
export function ImportWizard({
  initialAccountId,
}: {
  /** Account to pre-select, from a grid cell's `/import?accountId=…` handoff. */
  initialAccountId?: AccountId;
}) {
  const [state, dispatch] = useReducer(wizardReducer, initialAccountId, (accountId) =>
    makeInitialWizardState(readPrefill(accountId)),
  );
  const accountsQuery = useQuery(accountQueries.list());
  const accounts = (accountsQuery.data?.items ?? []) as readonly Account[];
  const reducedMotion = useReducedMotion() ?? false;

  // The account's **Statement Formats** (issue #184). Ordinary contract data the
  // client fetches — web ADR 0001 stands, since the rows themselves never leave
  // the browser. Scoped to the account, which is why it comes second: the
  // account is settled before a file is taken (issue #181), so by the time there
  // is anything to detect this has been asked for.
  const formatsQuery = useQuery({
    ...statementFormatQueries.list({ accountId: state.accountId ?? undefined }),
    enabled: state.accountId !== null,
  });
  // The CSV ones only: a PDF format carries no header fingerprint, so it could
  // only ever fail against a CSV — offering one is a guaranteed error.
  const formats = useMemo(
    () => csvFormats((formatsQuery.data?.items ?? []) as readonly StatementFormat[]),
    [formatsQuery.data],
  );

  // Detection, once the file and the account's formats are both in hand. An
  // effect because those two arrive independently: a dropped CSV parses in a
  // moment, a grid handoff is there at mount, and the formats come off the
  // network. `formatSelection` is what makes this run once per file — the
  // reducer sets it on every verdict and on a manual pick, and clears it
  // wherever the file or the account changes.
  useEffect(() => {
    if (state.source !== "csv" || state.headers.length === 0) return;
    if (state.formatSelection !== null || formatsQuery.isPending) return;
    dispatch({ type: "detect-format", detection: detectFormat(state.headers, formats) });
  }, [state.source, state.headers, state.formatSelection, formats, formatsQuery.isPending]);

  /** The record the preview and the commit are read through; `undefined` until picked. */
  const selectedFormat = useMemo(
    () => formats.find((format) => format.id === state.formatId),
    [formats, state.formatId],
  );

  // The previewed rows and the **stable row id** each one is skipped by, kept
  // positional with one another — the convention the duplicate flags already
  // follow, so one index reads a row, its mark and its identity.
  //
  // On the PDF path the ids are already positional with the extracted rows. On
  // the CSV path they are not: the ids name papaparse's rows and the **Statement
  // Format**'s row filter drops the ones it won't import, so each record's id is
  // read off the source row `applyFormat` reports rather than off its own
  // position (issue #192).
  const { records, rowIds } = useMemo<{
    records: ParsedTransaction[];
    rowIds: readonly RowId[];
  }>(() => {
    if (state.accountId === null) return { records: [], rowIds: [] };
    const ctx = {
      accountId: state.accountId,
      importBatchId: state.importBatchId,
    };
    // PDF path: the extracted candidates rejoin the shared commit rail once
    // enriched with account/batch/month — no parser (the file has no headers).
    if (state.source === "pdf") {
      if (!state.extracted) return { records: [], rowIds: [] };
      return { records: enrichExtracted(state.extracted, ctx), rowIds: state.rowIds };
    }
    if (!selectedFormat) return { records: [], rowIds: [] };
    const parsed = applyFormat(selectedFormat, state.rows, ctx);
    return {
      records: parsed.map(({ record }) => record),
      rowIds: parsed.map(({ sourceIndex }) => state.rowIds[sourceIndex]),
    };
  }, [
    state.source,
    state.extracted,
    selectedFormat,
    state.accountId,
    state.rows,
    state.rowIds,
    state.importBatchId,
  ]);

  const sourceLabel = state.source === "pdf" ? "PDF extraction" : (selectedFormat?.name ?? "—");

  const accountName = accounts.find((account) => account.id === state.accountId)?.name ?? "—";

  // The PDF validation step is a side-by-side (PDF beside editable rows) and
  // needs the full width to show the statement clearly; every other step is a
  // single narrow column and reads better capped. Widen only for that step.
  let wide = false;

  let stepContent: ReactNode = null;
  if (state.step === "upload") {
    stepContent = <UploadStep formats={formats} state={state} dispatch={dispatch} />;
  } else if (
    state.accountId !== null &&
    state.source === "pdf" &&
    state.file !== null &&
    state.extracted !== null &&
    state.declaredTotals !== null
  ) {
    // PDF path: the side-by-side validation view (PDF beside editable rows).
    wide = true;
    stepContent = (
      <PdfValidationStep
        records={records}
        rowIds={rowIds}
        skippedRows={state.skippedRows}
        extracted={state.extracted}
        declaredTotals={state.declaredTotals}
        file={state.file}
        extractionMs={state.extractionMs}
        onBack={() => dispatch({ type: "back-to-upload" })}
        dispatch={dispatch}
      />
    );
  } else if (state.accountId !== null && selectedFormat !== undefined) {
    stepContent = (
      <PreviewStep
        records={records}
        rowIds={rowIds}
        skippedRows={state.skippedRows}
        accountName={accountName}
        parserLabel={sourceLabel}
        onBack={() => dispatch({ type: "back-to-upload" })}
        dispatch={dispatch}
      />
    );
  }

  return (
    <PageLayout
      title="Import"
      description={
        state.step === "upload"
          ? "Pick the account, drop its CSV or PDF statement, and preview before committing."
          : "Review what will be written — committing adds these rows to the account."
      }
      className={`mx-auto ${wide ? "w-full" : "max-w-3xl"}`}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={state.step} {...stepPresence(reducedMotion)}>
          {stepContent}
        </motion.div>
      </AnimatePresence>
    </PageLayout>
  );
}

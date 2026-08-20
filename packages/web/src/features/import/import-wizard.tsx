import type { Account, AccountId, StatementFormat } from "@mamen/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { type ReactNode, useEffect, useMemo, useReducer } from "react";
import { PageLayout } from "@/components/page-layout";
import { stepPresence } from "@/lib/motion";
import { accountQueries, statementFormatQueries } from "@/lib/sdk";
import { enrichExtracted } from "./enrich-extracted";
import { takeHandoff } from "./import-handoff";
import { MappingStep } from "./mapping-step";
import { applyFormat, type FormatToApply } from "./parsers/apply-format";
import { csvFormats, detectFormat } from "./parsers/detect-format";
import { draftCreate, draftRules } from "./parsers/format-draft";
import type { ParsedTransaction } from "./parsers/types";
import { PdfValidationStep } from "./pdf-validation-step";
import { PreviewStep } from "./preview-step";
import { UploadStep } from "./upload-step";
import {
  makeInitialWizardState,
  type RowId,
  type WizardPrefill,
  type WizardStep,
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

/** What the page says it is for, which is not the same thing on every step. */
function stepDescription(step: WizardStep): string {
  switch (step) {
    case "upload":
      return "Pick the account, drop its CSV or PDF statement, and preview before committing.";
    case "mapping":
      return "Say how this bank writes its statement — the rows below are read as you choose.";
    case "preview":
      return "Review what will be written — committing adds these rows to the account.";
  }
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

  /** The stored record the preview and the commit read; `undefined` until picked. */
  const selectedFormat = useMemo(
    () => formats.find((format) => format.id === state.formatId),
    [formats, state.formatId],
  );

  /**
   * What the rows are actually read with — the **Statement Format** the user is
   * building from this very file (issue #186) if there is one, otherwise the
   * stored record they picked.
   *
   * One derivation for both, so the mapping step's live preview, the preview
   * step's table and the commit are the same reading of the same file. A
   * separate one for the draft would be a second answer to "what does this
   * format make of this row", and the whole point of the live preview is that
   * what it shows is what will be committed.
   *
   * The draft comes first where both exist, which in practice they do not: the
   * reducer drops each when the other is chosen.
   */
  const activeFormat: FormatToApply | undefined = useMemo(() => {
    const drafted = state.draftFormat === null ? null : draftRules(state.draftFormat);
    return drafted ?? selectedFormat;
  }, [state.draftFormat, selectedFormat]);

  /**
   * The format this import will save alongside its rows, or `null` when it is
   * reading one that already exists. Built here because the two things the draft
   * itself cannot know — the account it belongs to and the file's own header row
   * — are the wizard's (issue #186).
   */
  const formatToCreate = useMemo(
    () =>
      state.draftFormat === null || state.accountId === null
        ? null
        : draftCreate(state.draftFormat, state.accountId, state.headers),
    [state.draftFormat, state.accountId, state.headers],
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
    if (!activeFormat) return { records: [], rowIds: [] };
    const parsed = applyFormat(activeFormat, state.rows, ctx);
    return {
      records: parsed.map(({ record }) => record),
      rowIds: parsed.map(({ sourceIndex }) => state.rowIds[sourceIndex]),
    };
  }, [
    state.source,
    state.extracted,
    activeFormat,
    state.accountId,
    state.rows,
    state.rowIds,
    state.importBatchId,
  ]);

  // What the preview calls the format it read the rows with. A draft has no
  // stored name to look up — it is named in the step that is building it.
  const sourceLabel =
    state.source === "pdf"
      ? "PDF extraction"
      : ((state.draftFormat?.name.trim() || selectedFormat?.name) ?? "—");

  const accountName = accounts.find((account) => account.id === state.accountId)?.name ?? "—";

  // The PDF validation step is a side-by-side (PDF beside editable rows) and
  // needs the full width to show the statement clearly; every other step is a
  // single narrow column and reads better capped. Widen only for that step.
  let wide = false;

  let stepContent: ReactNode = null;
  if (state.step === "upload") {
    stepContent = <UploadStep formats={formats} state={state} dispatch={dispatch} />;
  } else if (state.step === "mapping" && state.draftFormat !== null) {
    stepContent = (
      <MappingStep
        fileName={state.fileName ?? "this file"}
        headers={state.headers}
        reason={state.formatSelection}
        draft={state.draftFormat}
        records={records}
        rowCount={state.rows.length}
        dispatch={dispatch}
      />
    );
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
  } else if (state.accountId !== null && activeFormat !== undefined) {
    stepContent = (
      <PreviewStep
        records={records}
        rowIds={rowIds}
        skippedRows={state.skippedRows}
        accountName={accountName}
        parserLabel={sourceLabel}
        formatToCreate={formatToCreate}
        onBack={() => dispatch({ type: "back-to-upload" })}
        dispatch={dispatch}
      />
    );
  }

  return (
    <PageLayout
      title="Import"
      description={stepDescription(state.step)}
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

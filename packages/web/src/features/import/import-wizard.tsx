import type { Account, AccountId } from "@mamen/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { type ReactNode, useMemo, useReducer } from "react";
import { stepPresence } from "@/lib/motion";
import { accountQueries } from "@/lib/sdk";
import { enrichExtracted } from "./enrich-extracted";
import { takeHandoff } from "./import-handoff";
import { detectParser, getParserById } from "./parsers/registry";
import type { ParsedTransaction } from "./parsers/types";
import { PdfValidationStep } from "./pdf-validation-step";
import { PreviewStep } from "./preview-step";
import { UploadStep } from "./upload-step";
import {
	makeInitialWizardState,
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
		...(handoff
			? {
					file: {
						fileName: handoff.fileName,
						headers: handoff.headers,
						rows: handoff.rows,
						detectedParserId: detectParser(handoff.headers)?.id ?? null,
					},
				}
			: {}),
	};
}

/**
 * The 3-step CSV import wizard (PRD): (1) file drop + parser auto-detect +
 * account selection, (2) mandatory preview, (3) commit → toast → navigate. State
 * is local (`useReducer`) — there is no global store. The parsed records are
 * derived from the chosen parser + rows so the preview and commit share one
 * source of truth.
 */
export function ImportWizard({
	initialAccountId,
}: {
	/** Account to pre-select, from a grid cell's `/import?accountId=…` handoff. */
	initialAccountId?: AccountId;
}) {
	const [state, dispatch] = useReducer(
		wizardReducer,
		initialAccountId,
		(accountId) => makeInitialWizardState(readPrefill(accountId)),
	);
	const accountsQuery = useQuery(accountQueries.list());
	const accounts = (accountsQuery.data?.items ?? []) as readonly Account[];
	const reducedMotion = useReducedMotion() ?? false;

	const records = useMemo<ParsedTransaction[]>(() => {
		if (state.accountId === null) return [];
		const ctx = {
			accountId: state.accountId,
			importBatchId: state.importBatchId,
		};
		// PDF path: the extracted candidates rejoin the shared commit rail once
		// enriched with account/batch/month — no parser (the file has no headers).
		if (state.source === "pdf") {
			return state.extracted ? enrichExtracted(state.extracted, ctx) : [];
		}
		const parser = state.parserId ? getParserById(state.parserId) : undefined;
		if (!parser) return [];
		return parser.parse(state.rows, ctx);
	}, [
		state.source,
		state.extracted,
		state.parserId,
		state.accountId,
		state.rows,
		state.importBatchId,
	]);

	const sourceLabel =
		state.source === "pdf"
			? "PDF extraction"
			: state.parserId
				? (getParserById(state.parserId)?.label ?? state.parserId)
				: "—";

	const accountName =
		accounts.find((account) => account.id === state.accountId)?.name ?? "—";

	// The PDF validation step is a side-by-side (PDF beside editable rows) and
	// needs the full width to show the statement clearly; every other step is a
	// single narrow column and reads better capped. Widen only for that step.
	let wide = false;

	let stepContent: ReactNode = null;
	if (state.step === "upload") {
		stepContent = <UploadStep state={state} dispatch={dispatch} />;
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
				extracted={state.extracted}
				declaredTotals={state.declaredTotals}
				file={state.file}
				accountId={state.accountId}
				onBack={() => dispatch({ type: "back-to-upload" })}
				dispatch={dispatch}
			/>
		);
	} else if (state.accountId !== null && state.parserId !== null) {
		stepContent = (
			<PreviewStep
				records={records}
				accountId={state.accountId}
				accountName={accountName}
				parserLabel={sourceLabel}
				onBack={() => dispatch({ type: "back-to-upload" })}
			/>
		);
	}

	return (
		<section
			className={`mx-auto flex flex-col gap-6 ${wide ? "w-full" : "max-w-3xl"}`}
		>
			<header>
				<h1 className="text-2xl font-semibold text-ink text-balance">Import</h1>
				<p className="mt-1 text-muted">
					{state.step === "upload"
						? "Drop a CSV or PDF statement, pick its account, and preview before committing."
						: "Review what will be written — committing replaces each month."}
				</p>
			</header>

			<AnimatePresence mode="wait" initial={false}>
				<motion.div key={state.step} {...stepPresence(reducedMotion)}>
					{stepContent}
				</motion.div>
			</AnimatePresence>
		</section>
	);
}

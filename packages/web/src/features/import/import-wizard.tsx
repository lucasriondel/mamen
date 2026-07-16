import type { Account, AccountId } from "@mamen/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { type ReactNode, useMemo, useReducer } from "react";
import { stepPresence } from "@/lib/motion";
import { accountQueries } from "@/lib/sdk";
import { takeHandoff } from "./import-handoff";
import { detectParser, getParserById } from "./parsers/registry";
import type { ParsedTransaction } from "./parsers/types";
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
		const parser = state.parserId ? getParserById(state.parserId) : undefined;
		if (!parser || state.accountId === null) return [];
		return parser.parse(state.rows, {
			accountId: state.accountId,
			importBatchId: state.importBatchId,
		});
	}, [state.parserId, state.accountId, state.rows, state.importBatchId]);

	let stepContent: ReactNode = null;
	if (state.step === "upload") {
		stepContent = <UploadStep state={state} dispatch={dispatch} />;
	} else if (state.accountId !== null && state.parserId !== null) {
		stepContent = (
			<PreviewStep
				records={records}
				accountId={state.accountId}
				accountName={
					accounts.find((account) => account.id === state.accountId)?.name ??
					"—"
				}
				parserLabel={getParserById(state.parserId)?.label ?? state.parserId}
				onBack={() => dispatch({ type: "back-to-upload" })}
			/>
		);
	}

	return (
		<section className="mx-auto flex max-w-3xl flex-col gap-6">
			<header>
				<h1 className="text-2xl font-semibold text-ink">Import</h1>
				<p className="mt-1 text-muted">
					{state.step === "upload"
						? "Drop a CSV statement, pick its account, and preview before committing."
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

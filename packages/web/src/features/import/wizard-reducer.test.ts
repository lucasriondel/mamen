import type { AccountId } from "@mamen/shared/contract";
import { describe, expect, it } from "vitest";
import { initialWizardState, wizardReducer } from "./wizard-reducer";

const HEADERS = ["Statut", "Date", "Montant", "Direction", "Intitulé"];
const ROWS = [{ Statut: "COMPLETE", Date: "2026-01-01T00:00:00Z" }];

describe("wizardReducer", () => {
	it("starts on the upload step with nothing configured", () => {
		expect(initialWizardState.step).toBe("upload");
		expect(initialWizardState.parserId).toBeNull();
		expect(initialWizardState.accountId).toBeNull();
	});

	it("auto-selects the parser when the file is recognized", () => {
		const state = wizardReducer(initialWizardState, {
			type: "file-parsed",
			fileName: "statement.csv",
			headers: HEADERS,
			rows: ROWS,
			detectedParserId: "green-got",
		});

		expect(state.fileName).toBe("statement.csv");
		expect(state.rows).toBe(ROWS);
		expect(state.parserId).toBe("green-got");
		expect(state.autoDetected).toBe(true);
		expect(state.importBatchId).toMatch(/.+/);
	});

	it("leaves the parser unset for a manual pick when unrecognized", () => {
		const state = wizardReducer(initialWizardState, {
			type: "file-parsed",
			fileName: "unknown.csv",
			headers: ["a", "b"],
			rows: ROWS,
			detectedParserId: null,
		});

		expect(state.parserId).toBeNull();
		expect(state.autoDetected).toBe(false);
	});

	it("records a manual parser choice and the account", () => {
		let state = wizardReducer(initialWizardState, {
			type: "select-parser",
			parserId: "green-got",
		});
		state = wizardReducer(state, {
			type: "select-account",
			accountId: 5 as AccountId,
		});

		expect(state.parserId).toBe("green-got");
		expect(state.accountId).toBe(5);
	});

	it("advances to preview only with a file, parser, and account", () => {
		const ready = wizardReducer(
			{
				...initialWizardState,
				rows: ROWS,
				parserId: "green-got",
				accountId: 5 as AccountId,
			},
			{ type: "go-to-preview" },
		);
		expect(ready.step).toBe("preview");

		const notReady = wizardReducer(
			{ ...initialWizardState, rows: ROWS, parserId: null, accountId: null },
			{ type: "go-to-preview" },
		);
		expect(notReady.step).toBe("upload");
	});

	it("goes back to upload from preview", () => {
		const state = wizardReducer(
			{ ...initialWizardState, step: "preview" },
			{ type: "back-to-upload" },
		);
		expect(state.step).toBe("upload");
	});

	it("records a file parse error", () => {
		const state = wizardReducer(initialWizardState, {
			type: "file-error",
			message: "Could not read that file.",
		});
		expect(state.error).toBe("Could not read that file.");
	});
});

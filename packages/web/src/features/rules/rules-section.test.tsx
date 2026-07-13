import type {
	Issuer,
	Rule,
	RuleDeletePreviewResult,
	RulePreviewResult,
	Transaction,
} from "@mamen/shared/contract";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the SDK seam: the section reads the issuer's rules (`ruleQueries.list`)
// and the issuer lookup (`issuerQueries.list`); the form previews via
// `ruleMutations.preview` and commits via `create`/`update`; the delete dialog
// reads `ruleQueries.deletePreview` and commits via `remove`; the manual-row
// action calls `transactionMutations.removeManualIssuer`. Real key factories are
// kept so the mutations' invalidation resolves.
const createRule = vi.fn();
const updateRule = vi.fn();
const removeRule = vi.fn();
const previewRule = vi.fn();
const removeManualIssuer = vi.fn();

let rulesByIssuer: Record<number, Rule[]>;
let issuersList: Issuer[];
let deletePreviewResult: RuleDeletePreviewResult;

vi.mock("@mamen/sdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@mamen/sdk")>();
	return {
		...actual,
		ruleQueries: {
			list: (params: { issuerId?: number }) => ({
				queryKey: ["rules", "list", params],
				queryFn: async () => {
					const items = rulesByIssuer[params.issuerId ?? -1] ?? [];
					return { items, total: items.length };
				},
			}),
			deletePreview: (id: number) => ({
				queryKey: ["rules", "delete-preview", id],
				queryFn: async () => deletePreviewResult,
			}),
		},
		issuerQueries: {
			list: () => ({
				queryKey: ["issuers", "list", "test"],
				queryFn: async () => ({
					items: issuersList,
					total: issuersList.length,
				}),
			}),
		},
		ruleMutations: {
			create: (payload: unknown) => createRule(payload),
			update: (id: unknown, patch: unknown) => updateRule(id, patch),
			remove: (id: unknown) => removeRule(id),
			preview: (input: unknown) => previewRule(input),
		},
		transactionMutations: {
			removeManualIssuer: (id: unknown) => removeManualIssuer(id),
		},
	};
});

const { RulesSection } = await import("./rules-section");

function issuer(overrides: Partial<Issuer> = {}): Issuer {
	return {
		id: 1 as Issuer["id"],
		name: "Amazon",
		createdAt: new Date("2026-01-01"),
		firstSeen: new Date("2026-01-01"),
		...overrides,
	} as Issuer;
}

function rule(overrides: Partial<Rule> = {}): Rule {
	return {
		id: 10 as Rule["id"],
		issuerId: 1 as Rule["issuerId"],
		pattern: "amazon",
		matchCount: 3,
		createdAt: new Date("2026-01-02"),
		...overrides,
	} as Rule;
}

function txn(overrides: Partial<Transaction> = {}): Transaction {
	return {
		id: 100 as Transaction["id"],
		accountId: 1 as Transaction["accountId"],
		date: new Date("2026-01-10"),
		amount: -12.5,
		rawIssuerString: "AMAZON EU SARL",
		importedAt: new Date(),
		importMonth: "2026-01",
		...overrides,
	} as Transaction;
}

function emptyPreview(): RulePreviewResult {
	return {
		willMatch: [],
		willReassign: [],
		manualCollisions: [],
		skipped: false,
	};
}

beforeEach(() => {
	createRule.mockReset().mockResolvedValue(rule());
	updateRule.mockReset().mockResolvedValue(rule());
	removeRule.mockReset().mockResolvedValue(undefined);
	previewRule.mockReset().mockResolvedValue(emptyPreview());
	removeManualIssuer.mockReset().mockResolvedValue(txn());
	rulesByIssuer = { 1: [rule()] };
	issuersList = [issuer(), issuer({ id: 2 as Issuer["id"], name: "AWS" })];
	deletePreviewResult = { willReassign: [], willUnmatch: [] };
});

describe("RulesSection — rule list", () => {
	it("lists the issuer's Matching Rules with their pattern and match count", async () => {
		render(<RulesSection issuer={issuer()} />);

		expect(await screen.findByText("amazon")).toBeInTheDocument();
		expect(screen.getByText(/3 matches/)).toBeInTheDocument();
		expect(
			screen.getByRole("heading", { name: "Matching Rules" }),
		).toBeInTheDocument();
	});

	it("shows an empty state when the issuer has no rules", async () => {
		rulesByIssuer = { 1: [] };
		render(<RulesSection issuer={issuer()} />);

		expect(
			await screen.findByText(/No Matching Rules yet/),
		).toBeInTheDocument();
	});
});

describe("RulesSection — create/edit form + preview", () => {
	it("previews the three lists as the pattern is typed and creates on save", async () => {
		rulesByIssuer = { 1: [] };
		previewRule.mockResolvedValue({
			willMatch: [txn({ id: 100 as Transaction["id"] })],
			willReassign: [
				txn({
					id: 101 as Transaction["id"],
					rawIssuerString: "AMZN MKTP",
					issuerId: 2 as Transaction["issuerId"],
				}),
			],
			manualCollisions: [],
			skipped: false,
		} satisfies RulePreviewResult);

		const user = userEvent.setup();
		render(<RulesSection issuer={issuer()} />);

		await user.click(await screen.findByRole("button", { name: /Add rule/ }));
		await user.type(screen.getByLabelText("Matching Rule pattern"), "amazon");

		// The preview fires (debounced) and the three lists render.
		await waitFor(() =>
			expect(previewRule).toHaveBeenCalledWith(
				expect.objectContaining({ issuerId: 1, pattern: "amazon" }),
			),
		);
		expect(
			await screen.findByRole("heading", { name: /Will match \(1\)/ }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("heading", { name: /Will reassign \(1\)/ }),
		).toBeInTheDocument();
		// The reassign row names the current owning issuer.
		expect(screen.getByText(/AWS/)).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "Create rule" }));
		await waitFor(() =>
			expect(createRule).toHaveBeenCalledWith({
				issuerId: 1,
				pattern: "amazon",
				matchCount: 0,
			}),
		);
	});

	it("offers a per-row remove-manual-issuer action on manual collisions", async () => {
		rulesByIssuer = { 1: [] };
		previewRule.mockResolvedValue({
			willMatch: [],
			willReassign: [],
			manualCollisions: [
				txn({
					id: 200 as Transaction["id"],
					manualIssuer: true,
					issuerId: 2 as Transaction["issuerId"],
				}),
			],
			skipped: false,
		} satisfies RulePreviewResult);

		const user = userEvent.setup();
		render(<RulesSection issuer={issuer()} />);

		await user.click(await screen.findByRole("button", { name: /Add rule/ }));
		await user.type(screen.getByLabelText("Matching Rule pattern"), "amazon");

		const removeButton = await screen.findByRole("button", {
			name: "Remove manual issuer",
		});
		await user.click(removeButton);

		await waitFor(() => expect(removeManualIssuer).toHaveBeenCalledWith(200));
	});

	it("edits an existing rule (update on save)", async () => {
		const user = userEvent.setup();
		render(<RulesSection issuer={issuer()} />);

		await user.click(
			await screen.findByRole("button", { name: /Edit rule amazon/ }),
		);
		const input = screen.getByLabelText("Matching Rule pattern");
		await user.clear(input);
		await user.type(input, "amzn");

		await user.click(screen.getByRole("button", { name: "Save rule" }));
		await waitFor(() =>
			expect(updateRule).toHaveBeenCalledWith(10, { pattern: "amzn" }),
		);
	});

	it("warns when the pattern is an invalid regex (skipped)", async () => {
		rulesByIssuer = { 1: [] };
		previewRule.mockResolvedValue({
			willMatch: [],
			willReassign: [],
			manualCollisions: [],
			skipped: true,
		} satisfies RulePreviewResult);

		const user = userEvent.setup();
		render(<RulesSection issuer={issuer()} />);

		await user.click(await screen.findByRole("button", { name: /Add rule/ }));
		// An unbalanced group is an invalid regex; the mock forces `skipped`.
		await user.type(
			screen.getByLabelText("Matching Rule pattern"),
			"(unclosed",
		);

		expect(
			await screen.findByText(/isn.t a valid regular expression/),
		).toBeInTheDocument();
	});
});

describe("RulesSection — delete confirmation", () => {
	it("shows the transactions that will reassign or unmatch, then deletes", async () => {
		deletePreviewResult = {
			willReassign: [
				txn({
					id: 300 as Transaction["id"],
					rawIssuerString: "AMZN MKTP",
					issuerId: 2 as Transaction["issuerId"],
				}),
			],
			willUnmatch: [txn({ id: 301 as Transaction["id"] })],
		};

		const user = userEvent.setup();
		render(<RulesSection issuer={issuer()} />);

		await user.click(
			await screen.findByRole("button", { name: /Delete rule amazon/ }),
		);

		expect(
			await screen.findByRole("heading", { name: /Will reassign \(1\)/ }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("heading", { name: /Will unmatch \(1\)/ }),
		).toBeInTheDocument();
		expect(screen.getByText("AMZN MKTP")).toBeInTheDocument();

		const dialog = screen
			.getByRole("button", { name: "Delete rule" })
			.closest("div");
		await user.click(
			within(dialog as HTMLElement).getByRole("button", {
				name: "Delete rule",
			}),
		);
		await waitFor(() => expect(removeRule).toHaveBeenCalledWith(10));
	});
});

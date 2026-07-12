import type { AccountId } from "@mamen/shared/contract";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedTransaction } from "./parsers/types";

// SDK-boundary seam (PRD "Seam 2"): the commit talks to the SDK's transactions
// mutations only, so mock that surface and assert the exact calls — a
// `deleteByAccountMonth` per distinct month followed by a `bulkCreate`.
const deleteByAccountMonth = vi.fn();
const bulkCreate = vi.fn();

vi.mock("@mamen/sdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@mamen/sdk")>();
	return {
		...actual,
		transactionMutations: {
			...actual.transactionMutations,
			deleteByAccountMonth: (accountId: unknown, month: unknown) =>
				deleteByAccountMonth(accountId, month),
			bulkCreate: (records: unknown) => bulkCreate(records),
		},
	};
});

const { commitImport, distinctMonths } = await import("./commit");

const ACCOUNT_ID = 7 as AccountId;

function record(overrides: Partial<ParsedTransaction> = {}): ParsedTransaction {
	return {
		accountId: ACCOUNT_ID,
		date: new Date("2026-01-15T10:00:00Z"),
		amount: -10,
		rawIssuerString: "SHOP",
		importMonth: "2026-01",
		importBatchId: "batch-1",
		...overrides,
	};
}

beforeEach(() => {
	deleteByAccountMonth.mockReset().mockResolvedValue({ count: 0 });
	bulkCreate.mockReset().mockResolvedValue([]);
});

describe("distinctMonths", () => {
	it("returns the sorted distinct import months", () => {
		expect(
			distinctMonths([
				record({ importMonth: "2026-02" }),
				record({ importMonth: "2026-01" }),
				record({ importMonth: "2026-02" }),
			]),
		).toEqual(["2026-01", "2026-02"]);
	});
});

describe("commitImport", () => {
	it("deletes then bulk-creates per distinct month", async () => {
		const jan = record({ importMonth: "2026-01", rawIssuerString: "JAN" });
		const feb = record({ importMonth: "2026-02", rawIssuerString: "FEB" });

		await commitImport([jan, feb], ACCOUNT_ID);

		// One delete per month, both for the target account.
		expect(deleteByAccountMonth).toHaveBeenCalledTimes(2);
		expect(deleteByAccountMonth).toHaveBeenCalledWith(ACCOUNT_ID, "2026-01");
		expect(deleteByAccountMonth).toHaveBeenCalledWith(ACCOUNT_ID, "2026-02");

		// One bulkCreate per month, each carrying only that month's records with a
		// stamped `importedAt`.
		expect(bulkCreate).toHaveBeenCalledTimes(2);
		const [janRecords] = bulkCreate.mock.calls[0];
		expect(janRecords).toHaveLength(1);
		expect(janRecords[0].rawIssuerString).toBe("JAN");
		expect(janRecords[0].importedAt).toBeInstanceOf(Date);
	});

	it("deletes a month before creating into it", async () => {
		const order: string[] = [];
		deleteByAccountMonth.mockImplementation(() => {
			order.push("delete");
			return Promise.resolve({ count: 3 });
		});
		bulkCreate.mockImplementation(() => {
			order.push("create");
			return Promise.resolve([]);
		});

		await commitImport([record()], ACCOUNT_ID);

		expect(order).toEqual(["delete", "create"]);
	});
});

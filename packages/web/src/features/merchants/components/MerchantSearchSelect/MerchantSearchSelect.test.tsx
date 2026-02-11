import "fake-indexeddb/auto";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { MerchantSearchSelect } from "./index";

beforeAll(() => {
	global.ResizeObserver = class {
		observe(): void {}
		unobserve(): void {}
		disconnect(): void {}
	};
	Element.prototype.scrollIntoView = vi.fn();
});

describe("MerchantSearchSelect", () => {
	beforeEach(async () => {
		await db.merchants.clear();
		await db.transactions.clear();
	});

	it("displays placeholder when no merchant selected", async () => {
		render(<MerchantSearchSelect value={null} onChange={vi.fn()} />);

		expect(screen.getByText("Select merchant...")).toBeInTheDocument();
	});

	it("displays all merchants when opened", async () => {
		await db.merchants.bulkAdd([
			{ name: "Amazon", createdAt: new Date(), firstSeen: new Date() },
			{ name: "Uber", createdAt: new Date(), firstSeen: new Date() },
		]);

		const user = userEvent.setup();
		render(<MerchantSearchSelect value={null} onChange={vi.fn()} />);

		await user.click(screen.getByRole("combobox"));

		await waitFor(() => {
			expect(screen.getByText("Amazon")).toBeInTheDocument();
			expect(screen.getByText("Uber")).toBeInTheDocument();
		});
	});

	it("selection triggers onChange with merchant id", async () => {
		const merchantId = (await db.merchants.add({
			name: "Amazon",
			createdAt: new Date(),
			firstSeen: new Date(),
		})) as number;

		const onChange = vi.fn();
		const user = userEvent.setup();
		render(<MerchantSearchSelect value={null} onChange={onChange} />);

		await user.click(screen.getByRole("combobox"));

		await waitFor(() => {
			expect(screen.getByText("Amazon")).toBeInTheDocument();
		});

		await user.click(screen.getByText("Amazon"));
		expect(onChange).toHaveBeenCalledWith(merchantId);
	});

	it("shows selected merchant name", async () => {
		const merchantId = (await db.merchants.add({
			name: "Amazon",
			createdAt: new Date(),
			firstSeen: new Date(),
		})) as number;

		render(<MerchantSearchSelect value={merchantId} onChange={vi.fn()} />);

		await waitFor(() => {
			expect(screen.getByText("Amazon")).toBeInTheDocument();
		});
	});

	it("shows transaction count for each merchant", async () => {
		const merchantId = (await db.merchants.add({
			name: "Amazon",
			createdAt: new Date(),
			firstSeen: new Date(),
		})) as number;

		await db.transactions.bulkAdd([
			{
				accountId: 1,
				date: new Date(),
				amount: -10,
				rawMerchantString: "AMZN",
				merchantId,
				importedAt: new Date(),
				importMonth: "2025-01",
			},
			{
				accountId: 1,
				date: new Date(),
				amount: -20,
				rawMerchantString: "AMZN2",
				merchantId,
				importedAt: new Date(),
				importMonth: "2025-01",
			},
		]);

		const user = userEvent.setup();
		render(<MerchantSearchSelect value={null} onChange={vi.fn()} />);

		await user.click(screen.getByRole("combobox"));

		await waitFor(() => {
			expect(screen.getByText("2 txns")).toBeInTheDocument();
		});
	});
});

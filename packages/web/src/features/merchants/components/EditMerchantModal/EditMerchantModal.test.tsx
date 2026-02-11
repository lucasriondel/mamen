import "fake-indexeddb/auto";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { EditMerchantModal } from "./index";

beforeAll(() => {
	global.ResizeObserver = class {
		observe(): void {}
		unobserve(): void {}
		disconnect(): void {}
	};
	Element.prototype.scrollIntoView = vi.fn();
});

describe("EditMerchantModal", () => {
	let merchantId: number;

	beforeEach(async () => {
		await db.merchants.clear();
		await db.categories.clear();

		merchantId = (await db.merchants.add({
			name: "Amazon",
			defaultCategoryId: undefined,
			createdAt: new Date(),
			firstSeen: new Date(),
		})) as number;
	});

	it("pre-fills with current merchant data", () => {
		render(
			<EditMerchantModal
				isOpen={true}
				onClose={vi.fn()}
				merchantId={merchantId}
				currentName="Amazon"
				currentCategoryId={undefined}
			/>,
		);

		expect(screen.getByDisplayValue("Amazon")).toBeInTheDocument();
		expect(screen.getByText("Edit Merchant")).toBeInTheDocument();
	});

	it("validates name is not empty", async () => {
		const user = userEvent.setup();

		render(
			<EditMerchantModal
				isOpen={true}
				onClose={vi.fn()}
				merchantId={merchantId}
				currentName="Amazon"
				currentCategoryId={undefined}
			/>,
		);

		const input = screen.getByDisplayValue("Amazon");
		await user.clear(input);

		const saveButton = screen.getByRole("button", { name: "Save" });
		expect(saveButton).toBeDisabled();
	});

	it("saves changes to database", async () => {
		const user = userEvent.setup();
		const handleClose = vi.fn();

		render(
			<EditMerchantModal
				isOpen={true}
				onClose={handleClose}
				merchantId={merchantId}
				currentName="Amazon"
				currentCategoryId={undefined}
			/>,
		);

		const input = screen.getByDisplayValue("Amazon");
		await user.clear(input);
		await user.type(input, "Amazon Updated");
		await user.click(screen.getByRole("button", { name: "Save" }));

		await waitFor(() => {
			expect(handleClose).toHaveBeenCalled();
		});

		const merchant = await db.merchants.get(merchantId);
		expect(merchant?.name).toBe("Amazon Updated");
	});
});

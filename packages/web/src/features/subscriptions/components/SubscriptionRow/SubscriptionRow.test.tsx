import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Subscription } from "@/types";
import { SubscriptionRow } from "./index";

const makeSubscription = (
	overrides: Partial<Subscription> = {},
): Subscription => ({
	id: 1,
	merchantId: 10,
	merchantName: "Netflix",
	typicalAmount: -15.99,
	frequency: "monthly",
	intervalDays: 30,
	lastChargeDate: "2026-01-18",
	firstChargeDate: "2025-06-18",
	chargeCount: 8,
	status: "active",
	transactionIds: [100, 101, 102],
	detectedAt: "2026-01-20",
	updatedAt: "2026-01-20",
	...overrides,
});

describe("SubscriptionRow", () => {
	it("renders merchant name, amount, frequency, and last charge date", () => {
		render(
			<SubscriptionRow
				subscription={makeSubscription()}
				isFocused={false}
				isExpanded={false}
				onClick={vi.fn()}
			/>,
		);

		expect(screen.getByText("Netflix")).toBeInTheDocument();
		expect(screen.getByText(/15,99/)).toBeInTheDocument();
		expect(screen.getByText("/mo")).toBeInTheDocument();
		expect(screen.getByText(/Jan 18/)).toBeInTheDocument();
	});

	it("renders yearly frequency as /yr", () => {
		render(
			<SubscriptionRow
				subscription={makeSubscription({
					frequency: "yearly",
					typicalAmount: -119.88,
				})}
				isFocused={false}
				isExpanded={false}
				onClick={vi.fn()}
			/>,
		);

		expect(screen.getByText("/yr")).toBeInTheDocument();
	});

	it("renders weekly frequency as /wk", () => {
		render(
			<SubscriptionRow
				subscription={makeSubscription({ frequency: "weekly" })}
				isFocused={false}
				isExpanded={false}
				onClick={vi.fn()}
			/>,
		);

		expect(screen.getByText("/wk")).toBeInTheDocument();
	});

	it("renders active subscription with normal styling", () => {
		const { container } = render(
			<SubscriptionRow
				subscription={makeSubscription({ status: "active" })}
				isFocused={false}
				isExpanded={false}
				onClick={vi.fn()}
			/>,
		);

		const row = container.firstElementChild as HTMLElement;
		expect(row).not.toHaveClass("opacity-60");
		expect(screen.queryByText("Possibly cancelled")).not.toBeInTheDocument();
	});

	it("renders possibly-cancelled subscription with muted styling and badge", () => {
		const { container } = render(
			<SubscriptionRow
				subscription={makeSubscription({ status: "possibly-cancelled" })}
				isFocused={false}
				isExpanded={false}
				onClick={vi.fn()}
			/>,
		);

		const row = container.firstElementChild as HTMLElement;
		expect(row).toHaveClass("opacity-60");
		expect(screen.getByText("Possibly cancelled")).toBeInTheDocument();
	});

	it("calls onClick when clicked", async () => {
		const user = userEvent.setup();
		const handleClick = vi.fn();

		render(
			<SubscriptionRow
				subscription={makeSubscription()}
				isFocused={false}
				isExpanded={false}
				onClick={handleClick}
			/>,
		);

		await user.click(screen.getByText("Netflix"));
		expect(handleClick).toHaveBeenCalledOnce();
	});

	it("renders focused styling when isFocused is true", () => {
		const { container } = render(
			<SubscriptionRow
				subscription={makeSubscription()}
				isFocused={true}
				isExpanded={false}
				onClick={vi.fn()}
			/>,
		);

		const row = container.firstElementChild as HTMLElement;
		expect(row).toHaveClass("ring-2");
	});
});

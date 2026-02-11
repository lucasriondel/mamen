import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Subscription } from "@/types";
import { SubscriptionsList } from "./index";

vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => vi.fn(),
}));

vi.mock("@/lib/db", () => ({
	db: {
		transactions: {
			where: () => ({
				anyOf: () => ({
					toArray: () => Promise.resolve([]),
				}),
			}),
		},
	},
	useLiveQuery: () => [],
}));

beforeAll(() => {
	global.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
	Element.prototype.scrollIntoView = vi.fn();
	Element.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
	Element.prototype.setPointerCapture = vi.fn();
	Element.prototype.releasePointerCapture = vi.fn();
});

const makeSub = (overrides: Partial<Subscription> = {}): Subscription => ({
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
	transactionIds: [100],
	detectedAt: "2026-01-20",
	updatedAt: "2026-01-20",
	...overrides,
});

const subscriptions: Subscription[] = [
	makeSub({
		id: 1,
		merchantName: "Netflix",
		typicalAmount: -15.99,
		frequency: "monthly",
		lastChargeDate: "2026-01-18",
	}),
	makeSub({
		id: 2,
		merchantName: "Spotify",
		typicalAmount: -9.99,
		frequency: "monthly",
		lastChargeDate: "2026-01-15",
		merchantId: 20,
	}),
	makeSub({
		id: 3,
		merchantName: "Adobe",
		typicalAmount: -119.88,
		frequency: "yearly",
		lastChargeDate: "2025-11-01",
		merchantId: 30,
	}),
	makeSub({
		id: 4,
		merchantName: "Gym",
		typicalAmount: -49.99,
		frequency: "monthly",
		status: "possibly-cancelled",
		lastChargeDate: "2025-10-01",
		merchantId: 40,
	}),
	makeSub({
		id: 5,
		merchantName: "Newspaper",
		typicalAmount: -4.99,
		frequency: "weekly",
		lastChargeDate: "2026-01-20",
		merchantId: 50,
	}),
];

describe("SubscriptionsList", () => {
	it("renders list of subscriptions", () => {
		render(<SubscriptionsList subscriptions={subscriptions} />);

		expect(screen.getByText("Netflix")).toBeInTheDocument();
		expect(screen.getByText("Spotify")).toBeInTheDocument();
		expect(screen.getByText("Adobe")).toBeInTheDocument();
		expect(screen.getByText("Gym")).toBeInTheDocument();
		expect(screen.getByText("Newspaper")).toBeInTheDocument();
	});

	it("default sort is by amount descending", () => {
		const { container } = render(
			<SubscriptionsList subscriptions={subscriptions} />,
		);

		const rows = container.querySelectorAll('[role="button"]');
		// Order: Adobe (119.88), Gym (49.99), Netflix (15.99), Spotify (9.99), Newspaper (4.99)
		expect(
			within(rows[0] as HTMLElement).getByText("Adobe"),
		).toBeInTheDocument();
		expect(within(rows[1] as HTMLElement).getByText("Gym")).toBeInTheDocument();
		expect(
			within(rows[2] as HTMLElement).getByText("Netflix"),
		).toBeInTheDocument();
	});

	it("changing sort re-orders list", async () => {
		const user = userEvent.setup();
		const { container } = render(
			<SubscriptionsList subscriptions={subscriptions} />,
		);

		// Change sort to "Merchant name (A-Z)"
		const sortTrigger = screen.getByRole("combobox", { name: /sort/i });
		await user.click(sortTrigger);
		const nameOption = screen.getByRole("option", { name: /Merchant name/i });
		await user.click(nameOption);

		const rows = container.querySelectorAll('[role="button"]');
		expect(
			within(rows[0] as HTMLElement).getByText("Adobe"),
		).toBeInTheDocument();
		expect(within(rows[1] as HTMLElement).getByText("Gym")).toBeInTheDocument();
		expect(
			within(rows[2] as HTMLElement).getByText("Netflix"),
		).toBeInTheDocument();
	});

	it("filter by frequency shows only matching", async () => {
		const user = userEvent.setup();
		render(<SubscriptionsList subscriptions={subscriptions} />);

		const frequencyTrigger = screen.getByRole("combobox", {
			name: /frequency/i,
		});
		await user.click(frequencyTrigger);
		const yearlyOption = screen.getByRole("option", { name: /Yearly/i });
		await user.click(yearlyOption);

		expect(screen.getByText("Adobe")).toBeInTheDocument();
		expect(screen.queryByText("Netflix")).not.toBeInTheDocument();
		expect(screen.queryByText("Spotify")).not.toBeInTheDocument();
	});

	it("filter by status shows only matching", async () => {
		const user = userEvent.setup();
		render(<SubscriptionsList subscriptions={subscriptions} />);

		const statusTrigger = screen.getByRole("combobox", { name: /status/i });
		await user.click(statusTrigger);
		const cancelledOption = screen.getByRole("option", {
			name: /Possibly cancelled/i,
		});
		await user.click(cancelledOption);

		expect(screen.getByText("Gym")).toBeInTheDocument();
		expect(screen.queryByText("Netflix")).not.toBeInTheDocument();
	});

	it("combined filter + sort works correctly", async () => {
		const user = userEvent.setup();
		const { container } = render(
			<SubscriptionsList subscriptions={subscriptions} />,
		);

		// Filter to monthly only
		const frequencyTrigger = screen.getByRole("combobox", {
			name: /frequency/i,
		});
		await user.click(frequencyTrigger);
		const monthlyOption = screen.getByRole("option", { name: /Monthly/i });
		await user.click(monthlyOption);

		// Should show only monthly subs sorted by amount desc
		const rows = container.querySelectorAll('[role="button"]');
		expect(rows).toHaveLength(3); // Gym, Netflix, Spotify
		expect(within(rows[0] as HTMLElement).getByText("Gym")).toBeInTheDocument();
		expect(
			within(rows[1] as HTMLElement).getByText("Netflix"),
		).toBeInTheDocument();
		expect(
			within(rows[2] as HTMLElement).getByText("Spotify"),
		).toBeInTheDocument();
	});

	it("empty list shows no matches message", () => {
		render(<SubscriptionsList subscriptions={[]} />);

		expect(screen.getByText(/No subscriptions match/)).toBeInTheDocument();
	});
});

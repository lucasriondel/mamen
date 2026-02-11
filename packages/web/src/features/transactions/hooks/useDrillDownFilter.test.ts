import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { FocusModeProvider } from "@/context/FocusModeContext";
import { useDrillDownFilter } from "./useDrillDownFilter";

const transactionSearchSchema = z.object({
	highlight: z.coerce.number().optional(),
	categoryId: z.coerce.number().optional(),
	periodStart: z.string().optional(),
	periodEnd: z.string().optional(),
	from: z.string().optional(),
});

function TestComponent({
	onResult,
}: {
	onResult: (result: ReturnType<typeof useDrillDownFilter>) => void;
}): React.ReactElement {
	const result = useDrillDownFilter();
	onResult(result);
	return createElement("div", { "data-testid": "test-component" }, "rendered");
}

function renderWithSearch(
	initialSearch = "",
	onResult: (result: ReturnType<typeof useDrillDownFilter>) => void,
): ReturnType<typeof render> {
	const rootRoute = createRootRoute();

	const transactionsRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/transactions",
		validateSearch: transactionSearchSchema,
		component: () =>
			createElement(
				FocusModeProvider,
				null,
				createElement(TestComponent, { onResult }),
			),
	});

	const routeTree = rootRoute.addChildren([transactionsRoute]);

	const router = createRouter({
		routeTree,
		history: createMemoryHistory({
			initialEntries: [`/transactions${initialSearch}`],
		}),
	});

	return render(createElement(RouterProvider, { router }));
}

describe("useDrillDownFilter", () => {
	it("returns no active filter when no search params", async () => {
		let captured: ReturnType<typeof useDrillDownFilter> | null = null;
		renderWithSearch("", (result) => {
			captured = result;
		});

		await waitFor(() => {
			expect(screen.getByTestId("test-component")).toBeInTheDocument();
		});

		expect(captured?.filter.categoryId).toBeNull();
		expect(captured?.filter.periodStart).toBeNull();
		expect(captured?.filter.periodEnd).toBeNull();
		expect(captured?.filter.fromDashboard).toBe(false);
		expect(captured?.isActive).toBe(false);
	});

	it("parses categoryId from search params", async () => {
		let captured: ReturnType<typeof useDrillDownFilter> | null = null;
		renderWithSearch("?categoryId=5", (result) => {
			captured = result;
		});

		await waitFor(() => {
			expect(screen.getByTestId("test-component")).toBeInTheDocument();
		});

		expect(captured?.filter.categoryId).toBe(5);
		expect(captured?.isActive).toBe(true);
	});

	it("parses period dates from search params", async () => {
		const start = "2026-02-01T00:00:00.000Z";
		const end = "2026-02-28T23:59:59.999Z";
		let captured: ReturnType<typeof useDrillDownFilter> | null = null;
		renderWithSearch(
			`?categoryId=3&periodStart=${encodeURIComponent(start)}&periodEnd=${encodeURIComponent(end)}`,
			(result) => {
				captured = result;
			},
		);

		await waitFor(() => {
			expect(screen.getByTestId("test-component")).toBeInTheDocument();
		});

		expect(captured?.filter.periodStart).toEqual(new Date(start));
		expect(captured?.filter.periodEnd).toEqual(new Date(end));
	});

	it("sets fromDashboard true when from=dashboard", async () => {
		let captured: ReturnType<typeof useDrillDownFilter> | null = null;
		renderWithSearch("?categoryId=1&from=dashboard", (result) => {
			captured = result;
		});

		await waitFor(() => {
			expect(screen.getByTestId("test-component")).toBeInTheDocument();
		});

		expect(captured?.filter.fromDashboard).toBe(true);
	});

	it("handles invalid date params gracefully", async () => {
		let captured: ReturnType<typeof useDrillDownFilter> | null = null;
		renderWithSearch(
			"?categoryId=1&periodStart=invalid&periodEnd=also-invalid",
			(result) => {
				captured = result;
			},
		);

		await waitFor(() => {
			expect(screen.getByTestId("test-component")).toBeInTheDocument();
		});

		expect(captured?.filter.periodStart).toBeNull();
		expect(captured?.filter.periodEnd).toBeNull();
		expect(captured?.filter.categoryId).toBe(1);
	});
});

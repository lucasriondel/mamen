import "fake-indexeddb/auto";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { RulesPage } from "./index";

beforeAll(() => {
	window.ResizeObserver = vi.fn().mockImplementation(() => ({
		observe: vi.fn(),
		unobserve: vi.fn(),
		disconnect: vi.fn(),
	}));
	Element.prototype.scrollIntoView = vi.fn();
});

const seedData = async () => {
	const catId = await db.categories.add({
		name: "Shopping",
		slug: "shopping",
		color: "#3b82f6",
		icon: "shopping-cart",
		parentId: null,
		sortOrder: 1,
		createdAt: new Date(),
	});

	const streamingId = await db.categories.add({
		name: "Streaming",
		slug: "streaming",
		color: "#ef4444",
		icon: "tv",
		parentId: null,
		sortOrder: 2,
		createdAt: new Date(),
	});

	const amazonId = await db.merchants.add({
		name: "Amazon",
		defaultCategoryId: catId,
		createdAt: new Date(),
		firstSeen: new Date(),
	});

	const netflixId = await db.merchants.add({
		name: "Netflix",
		defaultCategoryId: streamingId,
		createdAt: new Date(),
		firstSeen: new Date(),
	});

	await db.rules.add({
		merchantId: amazonId,
		pattern: "AMZN.*",
		matchCount: 42,
		createdAt: new Date(),
	});

	await db.rules.add({
		merchantId: amazonId,
		pattern: "AMAZON\\.COM.*",
		categoryOverride: streamingId,
		matchCount: 12,
		createdAt: new Date(),
	});

	await db.rules.add({
		merchantId: netflixId,
		pattern: "NETFLIX.*",
		matchCount: 8,
		createdAt: new Date(),
	});

	return { catId, streamingId, amazonId, netflixId };
};

describe("RulesPage", () => {
	beforeEach(async () => {
		await db.transactions.clear();
		await db.rules.clear();
		await db.merchants.clear();
		await db.categories.clear();
	});

	it("should show empty state when no rules exist", async () => {
		render(<RulesPage />);
		expect(await screen.findByText("No rules yet")).toBeInTheDocument();
		expect(
			screen.getByText("Create rules by pressing R on transactions"),
		).toBeInTheDocument();
	});

	it("should display rules grouped by merchant", async () => {
		await seedData();
		render(<RulesPage />);

		expect(await screen.findByText("Amazon")).toBeInTheDocument();
		expect(screen.getByText("Netflix")).toBeInTheDocument();
		expect(screen.getByText("AMZN.*")).toBeInTheDocument();
		expect(screen.getByText("AMAZON\\.COM.*")).toBeInTheDocument();
		expect(screen.getByText("NETFLIX.*")).toBeInTheDocument();
	});

	it("should display match counts", async () => {
		await seedData();
		render(<RulesPage />);

		expect(await screen.findByText("42 matches")).toBeInTheDocument();
		expect(screen.getByText("12 matches")).toBeInTheDocument();
		expect(screen.getByText("8 matches")).toBeInTheDocument();
	});

	it("should display rule count in merchant header", async () => {
		await seedData();
		render(<RulesPage />);

		expect(await screen.findByText("(2 rules)")).toBeInTheDocument();
		expect(screen.getByText("(1 rule)")).toBeInTheDocument();
	});

	it("should show category override indicator", async () => {
		await seedData();
		render(<RulesPage />);

		expect(await screen.findByText("(override)")).toBeInTheDocument();
	});

	it("should filter rules by search query", async () => {
		await seedData();
		const user = userEvent.setup();
		render(<RulesPage />);

		await screen.findByText("Amazon");

		const searchInput = screen.getByPlaceholderText("Search rules...");
		await user.type(searchInput, "NETFLIX");

		expect(screen.getByText("Netflix")).toBeInTheDocument();
		expect(screen.queryByText("Amazon")).not.toBeInTheDocument();
	});

	it("should show no match message when search has no results", async () => {
		await seedData();
		const user = userEvent.setup();
		render(<RulesPage />);

		await screen.findByText("Amazon");

		const searchInput = screen.getByPlaceholderText("Search rules...");
		await user.type(searchInput, "nonexistent");

		expect(
			await screen.findByText("No rules match your search"),
		).toBeInTheDocument();
	});

	it("should clear search with X button", async () => {
		await seedData();
		const user = userEvent.setup();
		render(<RulesPage />);

		await screen.findByText("Amazon");

		const searchInput = screen.getByPlaceholderText("Search rules...");
		await user.type(searchInput, "NETFLIX");

		expect(screen.queryByText("Amazon")).not.toBeInTheDocument();

		const clearButton = screen.getByLabelText("Clear search");
		await user.click(clearButton);

		expect(await screen.findByText("Amazon")).toBeInTheDocument();
	});

	it("should display rule patterns in monospace font", async () => {
		await seedData();
		render(<RulesPage />);

		const pattern = await screen.findByText("AMZN.*");
		expect(pattern).toHaveClass("font-mono");
	});

	it("should show edit and delete buttons on rule rows", async () => {
		await seedData();
		render(<RulesPage />);

		await screen.findByText("AMZN.*");

		const editButtons = screen.getAllByLabelText(/edit rule/i);
		const deleteButtons = screen.getAllByLabelText(/delete rule/i);

		expect(editButtons.length).toBe(3);
		expect(deleteButtons.length).toBe(3);
	});

	it("should display keyboard shortcuts in footer", async () => {
		render(<RulesPage />);

		expect(await screen.findByText("J")).toBeInTheDocument();
		expect(screen.getByText("K")).toBeInTheDocument();
		expect(screen.getByText("Enter")).toBeInTheDocument();
		expect(screen.getByText("Del")).toBeInTheDocument();
		expect(screen.getByText("Esc")).toBeInTheDocument();
	});
});

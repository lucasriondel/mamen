// @vitest-environment node
//
// Node, not the package default of jsdom: nothing here renders. This file reads
// the sources and asserts a property of the tree as a whole, which no single
// component test can — that there is exactly *one* topbar implementation.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * One topbar, everywhere (issue #129).
 *
 * `PageLayout` (#125) started as a shape two pages opted into. While the other
 * ten composed their own title rows, the app had two title styles, and five of
 * those pages rendered no sidebar-reopen trigger at all — collapse the panel on
 * Transfers, Categories, a category's transactions, the recap detail or
 * `/settings` and the only way back was to navigate somewhere else.
 *
 * The behaviour is asserted where it belongs: the layout's own file for which
 * controls it draws in which state, and each view's file for the fact that its
 * page offers the trigger. What is left over is a property of the *set* of
 * pages, and it is the one that rots first — the next page to be added is the
 * one that quietly hand-rolls an `<h1>` again. So it is asserted here, over the
 * sources, rather than trusted to review.
 *
 * Paths are cwd-relative — vitest runs from the package root.
 */

/** Every `.ts`/`.tsx` under a directory, recursively, excluding test files. */
function sources(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) return sources(full);
		if (!/\.tsx?$/.test(entry.name)) return [];
		return /\.test\.tsx?$/.test(entry.name) ? [] : [full];
	});
}

const FILES = sources("src").map((path) => ({
	path,
	text: readFileSync(path, "utf8"),
}));

const LAYOUT = "src/components/page-layout.tsx";

/** Every page route, and the file that writes that page's topbar. */
const PAGES: Record<string, string> = {
	"accounts.tsx": "src/features/accounts/accounts-view.tsx",
	"categories.$categoryId.tsx":
		"src/features/categories/category-transactions-view.tsx",
	"categories.index.tsx": "src/features/categories/categories-view.tsx",
	"import.tsx": "src/features/import/import-wizard.tsx",
	"issuers.$issuerId.index.tsx": "src/features/issuers/issuer-detail-page.tsx",
	"issuers.$issuerId.rules.$ruleId.tsx":
		"src/features/rules/rule-form-page.tsx",
	"issuers.$issuerId.rules.new.tsx": "src/features/rules/rule-form-page.tsx",
	"issuers.index.tsx": "src/features/issuers/issuers-view.tsx",
	"issuers.new.tsx": "src/features/issuers/create-issuer-page.tsx",
	"recap-detail.tsx": "src/features/recap/detail/recap-detail-view.tsx",
	"recap.tsx": "src/features/recap/recap-view.tsx",
	"settings.tsx": "src/features/settings/settings-view.tsx",
	"transactions.tsx": "src/features/transactions/transactions-view.tsx",
	// The page's own not-found state carries the topbar too; the resolved row's
	// title — its counterparty — is the content component's.
	"transactions_.$transactionId.tsx":
		"src/features/transactions/transaction-detail-content.tsx",
	"transfers.tsx": "src/features/transfers/transfers-view.tsx",
};

/** The routes that mount no page of their own, and why. */
const NOT_PAGES: Record<string, string> = {
	"__root.tsx": "the shell every page renders inside, not a page",
	"index.tsx": "a redirect to /transactions — it renders nothing",
	"categories.tsx": "a layout route: one <Outlet /> over its two children",
	"issuers.$issuerId.tsx": "a layout route: one <Outlet /> over its children",
};

describe("the shared page layout", () => {
	it("is the only thing in the app that renders a page title", () => {
		// A hand-rolled `<h1>` is how a page ends up with a different title size,
		// no trigger, or both — every one of the twelve started that way.
		const files = FILES.filter(({ text }) => text.includes("<h1")).map(
			({ path }) => path,
		);

		expect(files).toStrictEqual([LAYOUT]);
	});

	it("is the only thing that renders the sidebar-reopen trigger", () => {
		// One caller means one place decides when the trigger appears and one place
		// hands `AppShell` the ref it focuses — which is what `PageHeader` existed
		// to guarantee back when a dozen pages mounted it themselves.
		const files = FILES.filter(
			({ path, text }) =>
				path !== join("src", "components", "ui", "sidebar.tsx") &&
				text.includes("<SidebarTrigger"),
		).map(({ path }) => path);

		expect(files).toStrictEqual([LAYOUT]);
	});

	it("is the only reader of the shell's collapse flag", () => {
		const files = FILES.filter(
			({ path, text }) =>
				path !== join("src", "lib", "sidebar-collapsed-context.tsx") &&
				text.includes("useSidebarCollapsedContext("),
		).map(({ path }) => path);

		expect(files).toStrictEqual([LAYOUT]);
	});

	it("sets the page title as the largest type in the app", () => {
		// "One title style" is not only one `<h1>`: it is also that nothing sits
		// beside a title shouting louder than it. Three drill-down pages end their
		// title row with a number — a category's total, a recap line's, a
		// transaction's amount — and the amount was a `text-3xl` headline back when
		// it was a row of its own, which reads as the page's title once it moves
		// into the title's row.
		//
		// Named steps only: an arbitrary `text-[…]` is as often a colour as a size,
		// and guessing which would make this guard lie either way.
		const files = FILES.filter(({ text }) =>
			/\btext-(?:3xl|4xl|5xl|6xl|7xl|8xl|9xl)\b/.test(text),
		).map(({ path }) => path);

		expect(
			files,
			"these set type above the title's `text-2xl`: size them at or below it, or say here why this one outranks a page's name",
		).toStrictEqual([]);
	});

	it("left no `PageHeader` behind", () => {
		// The wrapper #125 composed for the trigger. With every page going through
		// the layout it had one caller, so it is gone and the layout renders the
		// trigger itself — the ticket's "no caller remains".
		expect(FILES.map(({ path }) => path)).not.toContain(
			join("src", "components", "page-header.tsx"),
		);
		const callers = FILES.filter(({ text }) =>
			/from "[^"]*page-header"/.test(text),
		).map(({ path }) => path);
		expect(callers).toStrictEqual([]);
	});

	it("is what every page route renders its title through", () => {
		// Named per route rather than derived from the imports: a route hands off
		// through one or two components before anything renders a title (the
		// `/import` route mounts a view that mounts the wizard), and following that
		// chain in a regex would pass any page whose *neighbour* has a layout. The
		// list is the question "is this a page, and where is its topbar written?",
		// asked once per route and answered where a reader can check it.
		for (const [route, page] of Object.entries(PAGES)) {
			expect(
				FILES.find(({ path }) => path === join(...page.split("/")))?.text,
				`${page} (route ${route}) must render <PageLayout>`,
			).toContain("<PageLayout");
		}
	});

	it("accounts for every route — as a page, or as a reason it is not one", () => {
		const routes = readdirSync(join("src", "routes")).filter((file) =>
			file.endsWith(".tsx"),
		);

		for (const route of routes) {
			expect(
				route in PAGES || route in NOT_PAGES,
				`${route} is a new route: add it to PAGES with the file that renders its topbar, or to NOT_PAGES with why it has none`,
			).toBe(true);
		}
		// …and nothing lingers in either list once its route is deleted.
		for (const listed of [...Object.keys(PAGES), ...Object.keys(NOT_PAGES)]) {
			expect(routes, `${listed} names no route`).toContain(listed);
		}
	});
});

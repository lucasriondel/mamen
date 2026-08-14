import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The gousse primitives that are vendored source rather than npm imports.
 *
 * `sidebar` is the first (issue #95): it arrives through `shadcn add
 * @gousse/sidebar`, which writes it to the `ui` alias — so a re-install
 * overwrites in place. As with the theme layer's vendoring test, the subject is
 * wiring a later refactor can silently undo: the compound surface the registry
 * publishes, the fact that the hand-written stand-in it replaced is gone from
 * the tree, and the biome exclusion that keeps the next `shadcn add` from
 * fighting the formatter. All are asserted as text.
 *
 * That surface is also what drifted (issue #105): the tree held an earlier,
 * smaller sidebar — icon-rail collapse, `cva` rows, no shell, no triggers — and
 * nothing here noticed, because the list below named only the parts that
 * version happened to have. It now names the whole of what the registry
 * publishes, and its companion stylesheet, which was never installed at all.
 *
 * Paths are cwd-relative: vitest runs from the package root.
 */

const read = (path: string) => readFileSync(path, "utf8");

const sidebar = read("src/components/ui/sidebar.tsx");
const chrome = read("src/styles/gousse/sidebar-chrome.css");
const indexCss = read("src/index.css");
const appSidebar = read("src/components/app-sidebar.tsx");
const biome = JSON.parse(read("../../biome.json")) as {
	files: { includes: string[] };
};

/** This file — it names the retired surface, so it cannot scan itself. */
const SELF = "components/ui/gousse-vendoring.test.ts";

/** Every `.ts`/`.tsx` file under `src`, with its contents. */
function sources(): Array<[string, string]> {
	return readdirSync("src", { recursive: true, encoding: "utf8" })
		.filter((path) => /\.tsx?$/.test(path) && path !== SELF)
		.map((path) => [path, read(`src/${path}`)]);
}

describe("the vendored gousse sidebar", () => {
	it("publishes the registry's compound surface", () => {
		for (const part of [
			// shells
			"Sidebar",
			"SidebarShell",
			// regions
			"SidebarHeader",
			"SidebarTitle",
			"SidebarContent",
			"SidebarGroup",
			"SidebarGroupLabel",
			"SidebarFooter",
			// rows
			"SidebarGlyph",
			"SidebarItem",
			"sidebarRowClass",
			// triggers
			"SidebarTrigger",
			"SidebarClose",
			// collapsible
			"SidebarCollapsible",
		]) {
			expect(sidebar).toContain(`export function ${part}(`);
		}
	});

	it("publishes the render-prop types its consumers annotate against", () => {
		for (const type of ["SidebarTitleRenderProps", "SidebarItemRenderProps"]) {
			expect(sidebar).toContain(`export type ${type} =`);
		}
	});

	it("is gousse's source, not the local stand-in it replaced", () => {
		expect(sidebar).not.toContain("SidebarNav");
		expect(sidebar).not.toContain("stand-in");
	});

	it("is the registry's current source, not the icon-rail fork it drifted into", () => {
		// The version that sat here collapsed to a `w-16` icon rail through a
		// `cva` row recipe. The registry collapses width to zero so the page
		// reflows, and leaves the row's hue surfaces to the chrome sheet.
		expect(sidebar).not.toContain("class-variance-authority");
		expect(sidebar).toContain("sidebar-row");
		expect(sidebar).toMatch(/inert=\{collapsed \? true : undefined\}/);
	});

	it("is left in upstream's own formatting, not the repo's", () => {
		const indented = sidebar
			.split("\n")
			.filter((line) => /^\s+\S/.test(line))
			.map((line) => line[0]);

		expect(indented).not.toContain("\t");
		expect(indented).toContain(" ");
	});

	it("is excluded from biome, so a re-install is not churned", () => {
		expect(biome.files.includes).toContain(
			"!packages/web/src/components/ui/sidebar.tsx",
		);
	});
});

describe("the sidebar chrome sheet", () => {
	it("is installed beside the theme layers it depends on", () => {
		expect(chrome.length).toBeGreaterThan(0);
		expect(chrome).toContain(".sidebar-row");
	});

	it("is imported by the global stylesheet, after the theme layer", () => {
		const order = [
			'@import "./styles/gousse/theme.css";',
			'@import "./styles/gousse/sidebar-chrome.css";',
		].map((line) => indexCss.indexOf(line));

		expect(order).not.toContain(-1);
		expect(order[0]).toBeLessThan(order[1]);
	});

	it("owns the row surfaces the component leaves to it", () => {
		// Without these the rows lay out correctly and render flat.
		expect(chrome).toMatch(/\.sidebar-row:hover\s*\{[^}]*background:/);
		expect(chrome).toMatch(/\.sidebar-row::before\s*\{/);
		expect(chrome).toContain(".sidebar-scroll");
	});

	it("lights the active row from aria-current as well as data-active", () => {
		// The router sets `aria-current="page"`; nothing sets `data-active` on a
		// row built by `createLink`. Both halves of each active rule are asserted
		// because the app's mark rides on the second one alone.
		for (const rule of [
			/\.sidebar-row\[data-active="true"\],\s*\.sidebar-row\[aria-current="page"\]\s*\{/,
			/\.sidebar-row\[data-active="true"\]::before,\s*\.sidebar-row\[aria-current="page"\]::before\s*\{/,
		]) {
			expect(chrome).toMatch(rule);
		}
	});
});

describe("the app sidebar", () => {
	it("renders through the vendored primitives", () => {
		expect(appSidebar).toMatch(/<SidebarContent>/);
		expect(appSidebar).toMatch(/SidebarItem/);
	});

	it("takes the responsive shell, not the static one", () => {
		expect(appSidebar).toContain("SidebarShell");
		expect(appSidebar).not.toMatch(/<Sidebar[\s>]/);
	});

	it("leaves its rows unhued", () => {
		// `--hue` is for consumers whose rows carry their own colour. mamen's nav
		// is a flat list of fixed destinations, so every row takes the neutral
		// resting surface the sheet falls back to.
		expect(appSidebar).not.toMatch(/\bhue=/);
		expect(appSidebar).not.toMatch(/\btinted\b/);
	});

	it("leaves no reference to the stand-in's surface anywhere in src", () => {
		const offenders = sources()
			.filter(([, body]) => /SidebarNav(Item)?\b/.test(body))
			.map(([path]) => path);

		expect(offenders).toStrictEqual([]);
	});
});

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
 * Paths are cwd-relative: vitest runs from the package root.
 */

const read = (path: string) => readFileSync(path, "utf8");

const sidebar = read("src/components/ui/sidebar.tsx");
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
			"Sidebar",
			"SidebarHeader",
			"SidebarContent",
			"SidebarGroup",
			"SidebarGroupLabel",
			"SidebarItem",
			"SidebarFooter",
		]) {
			expect(sidebar).toContain(`export function ${part}(`);
		}
	});

	it("is gousse's source, not the local stand-in it replaced", () => {
		expect(sidebar).not.toContain("SidebarNav");
		expect(sidebar).not.toContain("stand-in");
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

describe("the app sidebar", () => {
	it("renders through the vendored primitives", () => {
		expect(appSidebar).toMatch(/<SidebarContent>/);
		expect(appSidebar).toMatch(/SidebarItem/);
	});

	it("leaves no reference to the stand-in's surface anywhere in src", () => {
		const offenders = sources()
			.filter(([, body]) => /SidebarNav(Item)?\b/.test(body))
			.map(([path]) => path);

		expect(offenders).toStrictEqual([]);
	});
});

import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The four gousse primitives mamen uses are vendored source, not package
 * exports (issue #93) — installed with `shadcn add @gousse/{button,empty,
 * textarea,checkbox}` into the `ui` alias, then edited in place to absorb the
 * three adapters that only existed because an npm build cannot be edited.
 *
 * There is nothing to render here: the subject is *where the source lives*, and
 * that is exactly what a later refactor can silently undo — re-importing the
 * package because it is still installed (until #96 removes it), or
 * re-introducing a wrapper. Asserted as text.
 *
 * Paths are cwd-relative, as in the parser fixtures: vitest runs from the
 * package root.
 */

const read = (path: string) => readFileSync(path, "utf8");
const vendored = (name: string) => read(`src/components/ui/${name}.tsx`);

const PRIMITIVES = ["button", "empty", "textarea", "checkbox"];
const PACKAGE = "@lucasriondel/gousse-ui";

/** Every `.ts`/`.tsx` source file under `src`, so nothing can hide. */
function sourceFiles(): string[] {
	return readdirSync("src", { recursive: true, encoding: "utf8" })
		.filter((entry) => /\.tsx?$/.test(entry))
		.map((entry) => `src/${entry}`);
}

describe("the vendored primitives", () => {
	it("are owned source under the ui alias", () => {
		const lengths = PRIMITIVES.map((name) => vendored(name).length);

		expect(lengths.every((length) => length > 0)).toBe(true);
	});

	it("wrap nothing — the adapters are gone", () => {
		for (const name of PRIMITIVES) {
			expect(vendored(name)).not.toContain(PACKAGE);
		}
	});

	it("stay on the token utilities, never a hardcoded colour", () => {
		for (const name of PRIMITIVES) {
			const source = vendored(name).replace(/\/\*\*[\s\S]*?\*\//g, "");

			expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
			expect(source).not.toMatch(/\b(?:rgb|hsl|oklch)\(/);
		}
	});
});

describe("the npm package", () => {
	it("is imported by no file in the app", () => {
		const importers = sourceFiles().filter((path) =>
			new RegExp(`from\\s+"${PACKAGE}"`).test(read(path)),
		);

		expect(importers).toStrictEqual([]);
	});
});

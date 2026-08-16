import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The gousse primitives mamen uses are vendored source, not package exports
 * (issue #93) — installed with `shadcn add @gousse/…` into the `ui` alias, then
 * edited in place to absorb the three adapters that only existed because an npm
 * build cannot be edited.
 *
 * There is nothing to render here: the subject is *where the source lives*, and
 * that is exactly what a later refactor can silently undo — re-importing the
 * package because it is still installed (until #96 removes it), or
 * re-introducing a wrapper. Asserted as text.
 *
 * The AI settings page (issue #120) pulled the second batch in — the credential
 * tile, secret field, provider mark, settings/model rows and their spinner and
 * saved-flash dependencies. The PRD called gousse "a **new dependency**"; it is
 * not one here, and that is the whole point of ADR 0003. `shadcn add
 * @gousse/{credential-tile,model-row}` copies the source in and the page
 * composes it, so the components are used rather than reimplemented *and* no
 * private-registry credential returns to the build.
 *
 * Paths are cwd-relative, as in the parser fixtures: vitest runs from the
 * package root.
 */

const read = (path: string) => readFileSync(path, "utf8");
const vendored = (name: string) => read(`src/components/ui/${name}.tsx`);

const PRIMITIVES = [
	"button",
	"empty",
	"textarea",
	"checkbox",
	"credential-tile",
	"model-row",
	"provider-mark",
	"saved-flash",
	"secret-field",
	"setting-row",
	"spinner",
];

/**
 * The one vendored component that draws hardcoded colour, and the only one that
 * should: a provider's mark is that vendor's own brand — Claude's terracotta,
 * Google's four-colour G — and painting them in `--gousse-ink` would make three
 * of the four tiles indistinguishable at a glance, which is the job the mark
 * has. Named as an exception rather than dropped from the list, so the rule
 * still holds for every other file and this one still gets the import check.
 */
const BRAND_MARKS = "provider-mark";

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
		for (const name of PRIMITIVES.filter((it) => it !== BRAND_MARKS)) {
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

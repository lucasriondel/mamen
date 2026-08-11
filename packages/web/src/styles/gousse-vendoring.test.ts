import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The gousse theme layer is vendored source, not a package export (issue #92).
 *
 * There is nothing to render here: the subject is the wiring between
 * `components.json`, the three files the shadcn registry writes under
 * `src/styles/gousse/`, and the `@import`s in the global stylesheet. Those are
 * exactly the joints a later refactor can silently undo — repointing an import
 * back at `@lucasriondel/gousse-ui`, dropping the accent override, declaring a
 * second `dark` variant — so they are asserted as text.
 *
 * Paths are cwd-relative, as in the parser fixtures: vitest runs from the
 * package root.
 */

const read = (path: string) => readFileSync(path, "utf8");
const vendored = (name: string) => read(`src/styles/gousse/${name}.css`);

const componentsJson = JSON.parse(read("components.json")) as {
	registries?: Record<string, string>;
};
const indexCss = read("src/index.css");

const REGISTRY = "https://lucasriondel.github.io/gousse-ui";
const SHEETS = ["tokens", "theme", "effects"];

describe("the @gousse registry namespace", () => {
	it("is declared in components.json, pointing at the published registry", () => {
		expect(componentsJson.registries?.["@gousse"]).toBe(
			`${REGISTRY}/r/{name}.json`,
		);
	});
});

describe("the vendored stylesheets", () => {
	it("are owned source under src/styles/gousse", () => {
		const lengths = SHEETS.map((name) => vendored(name).length);

		expect(lengths.every((length) => length > 0)).toBe(true);
	});

	it("keeps the token contract as rgb channel triples", () => {
		const tokens = vendored("tokens");

		expect(tokens).toMatch(/:root\s*\{/);
		expect(tokens).toMatch(/--gousse-bg:\s*\d+ \d+ \d+;/);
		expect(tokens).toMatch(/\.dark\s*\{/);
	});

	it("leaves the class-based dark variant to theme.css alone", () => {
		expect(vendored("theme")).toContain("@custom-variant dark");
		expect(indexCss).not.toContain("@custom-variant");
	});

	it("maps the tokens onto the gousse-* utility namespace", () => {
		expect(vendored("theme")).toContain(
			"--color-gousse-bg: rgb(var(--gousse-bg));",
		);
	});
});

describe("the global stylesheet", () => {
	it("imports the vendored copies, in order, after tailwind", () => {
		const order = [
			'@import "tailwindcss";',
			'@import "./styles/gousse/tokens.css";',
			'@import "./styles/gousse/theme.css";',
			'@import "./styles/gousse/effects.css";',
		].map((line) => indexCss.indexOf(line));

		expect(order).not.toContain(-1);
		expect(order).toStrictEqual([...order].sort((a, b) => a - b));
	});

	it("imports no stylesheet from the npm package any more", () => {
		expect(indexCss).not.toMatch(/@import\s+"@lucasriondel\/gousse-ui/);
	});

	it("still scans the package dist, whose primitives are not vendored yet", () => {
		expect(indexCss).toContain(
			'@source "../../../node_modules/@lucasriondel/gousse-ui/dist";',
		);
	});

	it("keeps mamen's accent override on both ramps", () => {
		expect(indexCss).toMatch(/:root\s*\{[^}]*--gousse-accent:\s*37 99 235;/);
		expect(indexCss).toMatch(/\.dark\s*\{[^}]*--gousse-accent:\s*96 165 250;/);
	});
});

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, expectTypeOf, it } from "vitest";
import { APP_BASE_PATH, APP_BASE_PATH_SLASH } from "./app-base-path";
import * as packageRoot from "./index";

const source = readFileSync(
	fileURLToPath(new URL("./app-base-path.ts", import.meta.url)),
	"utf8",
);

describe("APP_BASE_PATH", () => {
	it("is the prefix the nginx template repeats as a literal", () => {
		expect(APP_BASE_PATH).toBe("/app");
	});

	it("is root-relative and carries no trailing slash", () => {
		expect(APP_BASE_PATH.startsWith("/")).toBe(true);
		expect(APP_BASE_PATH.endsWith("/")).toBe(false);
		// A router `basepath` and an nginx `location` are both written
		// unslashed; the slash form is the exception, not the base.
		expect(APP_BASE_PATH).toMatch(/^\/[a-z0-9-]+$/);
	});

	it("is derived, not restated, by the trailing-slash form", () => {
		expect(APP_BASE_PATH_SLASH).toBe(`${APP_BASE_PATH}/`);
		expect(APP_BASE_PATH_SLASH.endsWith("//")).toBe(false);
	});

	it("keeps a literal type, not a widened string", () => {
		// Enforced by `tsc --noEmit`, which covers this file: a consumer
		// typed against the prefix (a route id, an nginx-facing literal)
		// should not have to widen to accept it.
		// Written as type arguments, not values: passing the constant to
		// `expectTypeOf` infers through an unconstrained parameter, which
		// widens the literal to `string` and the assertion would pass on a
		// `string`-typed export too.
		expectTypeOf<typeof APP_BASE_PATH>().toEqualTypeOf<"/app">();
		expectTypeOf<typeof APP_BASE_PATH_SLASH>().toEqualTypeOf<"/app/">();
	});

	it("is exported from the package root", () => {
		expect(packageRoot.APP_BASE_PATH).toBe(APP_BASE_PATH);
		expect(packageRoot.APP_BASE_PATH_SLASH).toBe(APP_BASE_PATH_SLASH);
	});

	it("imports nothing, so a build config can read it", () => {
		// `vite.config.ts` loads before any app code and must not drag
		// `effect` in behind this constant.
		expect(source).not.toMatch(/^\s*import\b/m);
		expect(source).not.toMatch(/\brequire\(/);
	});
});

describe("the constant's documentation", () => {
	it("names the three places that must agree on the prefix", () => {
		expect(source).toMatch(/vite/i);
		expect(source).toMatch(/basepath/i);
		expect(source).toMatch(/nginx/i);
	});

	it("records why /api and /uploads sit outside the prefix", () => {
		expect(source).toMatch(/\/api\b/);
		expect(source).toMatch(/\/uploads\b/);
		expect(source).toMatch(/same-origin/i);
		expect(source).toMatch(/preflight/i);
		expect(source).toMatch(/cloudflare access/i);
	});
});

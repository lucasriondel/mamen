// @vitest-environment node
//
// Node, not the package default of jsdom: this file imports `vite.config.ts`
// for real rather than grepping it, and the config pulls in esbuild, which
// refuses to run under jsdom's `TextEncoder` ("your JavaScript environment is
// broken"). Nothing here renders, so there is no DOM to miss; the router's
// half of the adoption is asserted in `src/router.test.ts`, which needs one.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { APP_BASE_PATH, APP_BASE_PATH_SLASH } from "@mamen/shared";
import type { UserConfig } from "vite";
import { describe, expect, it } from "vitest";
import viteConfig from "../../vite.config";

/**
 * The SPA is served under a path prefix (issue #111). The prefix is one value —
 * `APP_BASE_PATH` in `@mamen/shared` (#109) — but four layers have to agree on
 * it, and only three of them can import it:
 *
 * - the **Vite build** (`base`), so emitted asset URLs carry the prefix;
 * - the **router** (`basepath`), so client-side routes resolve under it;
 * - the **nginx template**, which serves the shell and falls back to it on a
 *   deep link — plain text, so it repeats the prefix as a literal;
 * - the **Dockerfile**, which decides where on disk the build lands, and so
 *   whether `$uri` maps onto it.
 *
 * A half-prefixed app does not serve — the shell loads and its assets 404, or
 * the assets load and every deep link 404s — so the assertions here are about
 * the layers agreeing, not about the value. The two that repeat the literal are
 * held against the constant, because that copy is the one that drifts.
 *
 * `/api` and `/uploads` are the other half of the subject: they stay at the
 * root, unprefixed, for the reasons the constant documents. Moving them makes
 * the API call cross-origin, and nothing in this stack emits a CORS header.
 *
 * Paths are cwd-relative — vitest runs from the package root.
 */

const config = viteConfig as UserConfig;
const nginx = readFileSync("nginx.conf.template", "utf8");
const dockerfile = readFileSync("Dockerfile", "utf8");
const webmanifest = readFileSync("public/site.webmanifest", "utf8");

/** Every `.ts`/`.tsx` under a directory, recursively. */
function sources(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) return sources(full);
		return /\.tsx?$/.test(entry.name) ? [full] : [];
	});
}

/** Every `location <path>` the template declares, in order, modifiers kept. */
const locations = [...nginx.matchAll(/^\s*location\s+(.+?)\s*\{/gm)].map(
	(m) => m[1] as string,
);

describe("the Vite build", () => {
	it("serves the app from the prefix", () => {
		// Vite documents `base` as a directory URL, which is why the constant
		// publishes the slashed spelling rather than every consumer appending
		// one.
		expect(config.base).toBe(APP_BASE_PATH_SLASH);
	});

	it("reads the prefix rather than restating it", () => {
		const source = readFileSync("vite.config.ts", "utf8");
		expect(source).toMatch(/APP_BASE_PATH_SLASH/);
		// No second copy of the literal in the file that owns the build.
		expect(source).not.toContain(`"${APP_BASE_PATH}`);
	});

	it("leaves the dev proxies at the root", () => {
		// The dev server must reach the API exactly where the built app does.
		const proxy = config.server?.proxy ?? {};
		expect(Object.keys(proxy).sort()).toEqual(["/api", "/uploads"]);
		for (const path of Object.keys(proxy)) {
			expect(path.startsWith(APP_BASE_PATH)).toBe(false);
		}
	});
});

describe("the nginx template", () => {
	it("serves the app under the prefix, matched exactly", () => {
		// The slashed form, not a bare `location /app`: a prefix match on those
		// four bytes also swallows `/apple-touch-icon.png` and every other root
		// path that happens to start with them — and the root is exactly what
		// this app does not own.
		expect(locations).toContain(APP_BASE_PATH_SLASH);
		expect(locations).not.toContain(APP_BASE_PATH);
		// Which leaves the bare prefix to be sent into the slashed form.
		expect(locations).toContain(`= ${APP_BASE_PATH}`);
		const bare = nginx.match(
			new RegExp(`location\\s+=\\s+${APP_BASE_PATH}\\s*\\{([^}]*)\\}`),
		)?.[1];
		expect(bare).toMatch(new RegExp(`return\\s+30[12]\\s+${APP_BASE_PATH}/;`));
	});

	it("falls back to the prefixed shell, so a deep link is not a 404", () => {
		const block = nginx.match(
			new RegExp(`location\\s+${APP_BASE_PATH}/\\s*\\{([^}]*)\\}`),
		)?.[1];
		expect(block).toBeDefined();
		expect(block).toMatch(
			new RegExp(
				`try_files\\s+\\$uri\\s+\\$uri/\\s+${APP_BASE_PATH}/index\\.html;`,
			),
		);
	});

	it("keeps /api and /uploads at the root", () => {
		expect(locations).toContain("/api");
		expect(locations).toContain("/uploads");
		expect(locations).not.toContain(`${APP_BASE_PATH}/api`);
		expect(locations).not.toContain(`${APP_BASE_PATH}/uploads`);
		// The proxies are what makes the call same-origin; they are untouched.
		expect(nginx).toMatch(
			/location\s+\/api\s*\{[\s\S]*?proxy_pass\s+http:\/\/\$\{API_UPSTREAM\}/,
		);
		expect(nginx).toMatch(
			/location\s+\/uploads\s*\{[\s\S]*?proxy_pass\s+http:\/\/\$\{API_UPSTREAM\}/,
		);
	});

	it("caches the prefixed assets, and never the shell", () => {
		expect(locations).toContain(`${APP_BASE_PATH}/assets/`);
		expect(locations).toContain(`= ${APP_BASE_PATH}/index.html`);
		// The unprefixed spellings are dead paths now: nothing is served there.
		expect(locations).not.toContain("/assets/");
		expect(locations).not.toContain("= /index.html");
	});

	it("writes the prefix nowhere but on the app's own locations", () => {
		const prefixed = locations.filter((l) => l.includes(APP_BASE_PATH));
		expect(prefixed.length).toBeGreaterThan(0);
		for (const l of prefixed) {
			expect(l.replace(/^=\s*/, "").startsWith(APP_BASE_PATH)).toBe(true);
		}
	});

	it("points back at the constant it cannot import", () => {
		expect(nginx).toMatch(/APP_BASE_PATH/);
		expect(nginx).toMatch(/app-base-path\.ts/);
	});
});

describe("the image", () => {
	it("lands the build where the prefixed locations look for it", () => {
		// `location /app` resolves `$uri` under the nginx root, so the build has
		// to sit in a directory named for the prefix — the fourth copy of the
		// literal, and the reason the assertion is derived.
		expect(dockerfile).toMatch(
			new RegExp(
				`COPY --from=build /app/packages/web/dist /usr/share/nginx/html${APP_BASE_PATH}\\b`,
			),
		);
	});
});

describe("the public directory", () => {
	it("is never referenced from source at the root", () => {
		// Vite rewrites rooted URLs in `index.html` and in CSS; a `/icon.png`
		// written in a component is a string it never parses as a URL, so it
		// survives the build pointing outside the prefix at nothing. The check is
		// derived from what `public/` actually holds, so a file added there is
		// covered without anyone remembering this test.
		const assets = readdirSync("public");
		expect(assets.length).toBeGreaterThan(0);

		const offenders: string[] = [];
		for (const file of sources("src")) {
			if (file.includes(".test.")) continue;
			const text = readFileSync(file, "utf8");
			for (const asset of assets) {
				// The quote/backtick is the point: `${BASE}/icon.png` is fine,
				// `"/icon.png"` is not.
				if (new RegExp(`["'\`]/${asset}\\b`).test(text)) {
					offenders.push(`${file} -> /${asset}`);
				}
			}
		}
		expect(offenders).toEqual([]);
	});
});

describe("the web manifest", () => {
	it("names its icons relatively, so they resolve under the prefix", () => {
		// The manifest is copied verbatim out of `public/` — Vite rewrites URLs
		// in `index.html`, not inside a JSON file it never parses. A rooted
		// `/icon-192x192.png` would point outside the prefix at nothing.
		const icons = (JSON.parse(webmanifest) as { icons: { src: string }[] })
			.icons;
		expect(icons.length).toBeGreaterThan(0);
		for (const icon of icons) {
			expect(icon.src.startsWith("/")).toBe(false);
		}
	});
});

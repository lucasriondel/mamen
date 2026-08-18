import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";

/**
 * The app's colour scheme (issue #143) — chosen, not forced.
 *
 * `index.html` used to ship `class="dark"` on `<html>`, so the light half of the
 * token ramp was unreachable no matter what was stored or what the OS preferred.
 * The class is gone; what decides now is the **pre-paint script** in the shell's
 * head, because `next-themes` applies the stored choice in an effect — one frame
 * too late, which is a flash of the other scheme on every load.
 *
 * That script is the subject here, and it is asserted by *running the shipped
 * text*: the file is read, the inline script is lifted out of it, and it is
 * evaluated with `document`, `localStorage`, `location` and `matchMedia` passed
 * in as parameters. Free identifiers bind to those parameters, so every input is
 * controlled while the DOM it writes to is the real one. A hand-copied
 * reimplementation of the same logic in a test would assert nothing about what
 * ships.
 *
 * Paths are cwd-relative, as in `gousse-vendoring.test.ts`: vitest runs from the
 * package root.
 */

const read = (path: string) => readFileSync(path, "utf8");

const html = read("index.html");
const tokens = read("src/styles/gousse/tokens.css");
const indexCss = read("src/index.css");

/** The pre-paint script, exactly as the shell ships it. */
const BOOTSTRAP = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? "";

type Ambient = {
	/** The query string the page was loaded with, `?theme=…` included. */
	search?: string;
	/** What `localStorage` already holds under next-themes' key. */
	stored?: string | null;
	/** What the OS says, for the run where nothing is stored. */
	prefersDark?: boolean;
	/** Private browsing, a blocked third-party frame: storage that throws. */
	storageThrows?: boolean;
};

/**
 * Run the shipped script against a controlled ambient, and report what the
 * document and the store look like afterwards.
 */
function bootstrap({
	search = "",
	stored = null,
	prefersDark = false,
	storageThrows = false,
}: Ambient = {}) {
	// A fresh document per run, so a case may resolve twice and compare.
	document.documentElement.className = "";
	document.documentElement.removeAttribute("style");

	const store = new Map<string, string>();
	if (stored !== null) store.set("theme", stored);

	const guard = () => {
		if (storageThrows) throw new Error("storage is not available");
	};
	const localStorage = {
		getItem: (key: string) => {
			guard();
			return store.get(key) ?? null;
		},
		setItem: (key: string, value: string) => {
			guard();
			store.set(key, value);
		},
	};

	const matchMedia = (query: string) => ({
		media: query,
		matches: query.includes("dark") ? prefersDark : false,
	});

	new Function("document", "localStorage", "location", "matchMedia", BOOTSTRAP)(
		document,
		localStorage,
		{ search },
		matchMedia,
	);

	const root = document.documentElement;
	return {
		scheme: root.classList.contains("dark")
			? "dark"
			: root.classList.contains("light")
				? "light"
				: null,
		classes: [...root.classList],
		colorScheme: root.style.colorScheme,
		stored: store.get("theme") ?? null,
	};
}

beforeEach(() => {
	document.documentElement.className = "";
	document.documentElement.removeAttribute("style");
});

describe("the shell", () => {
	it("forces no scheme onto the document", () => {
		// The whole of issue #143: with a scheme class on this element, the light
		// ramp is unreachable and `prefers-color-scheme` is ignored. The tag
		// itself is matched, not the file — the prose below it says the word.
		expect(html.match(/<html[^>]*>/)?.[0]).toBe('<html lang="en">');
	});

	it("resolves the scheme before the app's own script", () => {
		// After the module script, the resolution would land a frame late and the
		// page would flash — which is the state `class="dark"` was papering over.
		const inline = html.indexOf("<script>");
		expect(inline).toBeGreaterThan(-1);
		expect(inline).toBeLessThan(html.indexOf('<script type="module"'));
		expect(inline).toBeLessThan(html.indexOf("</head>"));
	});

	it("names a colour for each ramp in its theme-color, and the right one", () => {
		// The browser's own chrome, which a single hardcoded `#0a0a0a` painted
		// dark under a light app. Derived from the tokens so the two cannot drift.
		for (const [scheme, ramp] of [
			["light", ":root"],
			["dark", "\\.dark"],
		]) {
			const bg = tokens.match(
				new RegExp(`${ramp}\\s*\\{[^}]*--gousse-bg:\\s*(\\d+) (\\d+) (\\d+);`),
			);
			expect(bg).not.toBeNull();
			const hex = `#${[bg?.[1], bg?.[2], bg?.[3]]
				.map((c) => Number(c).toString(16).padStart(2, "0"))
				.join("")}`;
			expect(html).toContain(
				`<meta name="theme-color" media="(prefers-color-scheme: ${scheme})" content="${hex}" />`,
			);
		}
	});
});

describe("the pre-paint script", () => {
	it("follows the OS when nothing is stored", () => {
		expect(bootstrap({ prefersDark: true }).scheme).toBe("dark");
		expect(bootstrap({ prefersDark: false }).scheme).toBe("light");
	});

	it("prefers a stored choice over the OS", () => {
		expect(bootstrap({ stored: "light", prefersDark: true }).scheme).toBe(
			"light",
		);
		expect(bootstrap({ stored: "dark", prefersDark: false }).scheme).toBe(
			"dark",
		);
	});

	it("treats a stored `system` as no choice at all", () => {
		// next-themes writes the literal `system` when the row is set back to it,
		// and it is not a class: it is the instruction to ask the OS.
		expect(bootstrap({ stored: "system", prefersDark: true }).scheme).toBe(
			"dark",
		);
	});

	it("tells the browser which scheme its built-in controls are on", () => {
		// Scrollbars, form controls and the caret. The stylesheet says the same
		// thing off the class; this is what makes it true before the class lands.
		expect(bootstrap({ stored: "dark" }).colorScheme).toBe("dark");
		expect(bootstrap({ stored: "light" }).colorScheme).toBe("light");
	});

	it("adds one scheme class and no other", () => {
		expect(bootstrap({ stored: "dark" }).classes).toStrictEqual(["dark"]);
	});

	it("takes a forced scheme from the URL, for automated capture", () => {
		expect(
			bootstrap({ search: "?theme=light", prefersDark: true }).scheme,
		).toBe("light");
		expect(
			bootstrap({ search: "?theme=dark", prefersDark: false }).scheme,
		).toBe("dark");
	});

	it("stores the forced scheme, so it survives the reload after it", () => {
		// The capture pipeline reloads between shots and the router does not carry
		// unknown search params through a navigation, so a param that only painted
		// this one page load would be no use to it.
		expect(bootstrap({ search: "?theme=light" }).stored).toBe("light");
		// `system` is a valid thing to force back to — it hands the page to the OS.
		expect(bootstrap({ search: "?theme=system" }).stored).toBe("system");
	});

	it("beats a contradicting stored choice with the forced one", () => {
		expect(bootstrap({ search: "?theme=light", stored: "dark" }).scheme).toBe(
			"light",
		);
	});

	it("ignores a scheme it does not know", () => {
		const run = bootstrap({
			search: "?theme=sepia",
			stored: "dark",
			prefersDark: false,
		});

		expect(run.scheme).toBe("dark");
		expect(run.stored).toBe("dark");
	});

	it("still paints when storage is unavailable", () => {
		// Private browsing throws on `localStorage`. Losing the preference there is
		// unavoidable; losing the page is not.
		expect(bootstrap({ storageThrows: true, prefersDark: true }).scheme).toBe(
			"dark",
		);
	});
});

describe("the token ramps", () => {
	const declared = (selector: string) =>
		new Set(
			[
				...`${tokens}\n${indexCss}`.matchAll(
					new RegExp(`${selector}\\s*\\{([^}]*)\\}`, "g"),
				),
			].flatMap((block) =>
				[...block[1].matchAll(/(--gousse-[\w-]+):/g)].map((m) => m[1]),
			),
		);

	it("define the same tokens, so neither scheme can be missing one", () => {
		// A token declared on one ramp only is exactly the "invisible control"
		// failure: it falls back to the other scheme's value, or to nothing.
		const light = declared(":root");
		const dark = declared("\\.dark");

		expect(light.size).toBeGreaterThan(0);
		expect([...light].filter((token) => !dark.has(token))).toStrictEqual([]);
		expect([...dark].filter((token) => !light.has(token))).toStrictEqual([]);
	});
});

import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The four files a visitor to the public repo reads first — `README.md`,
 * `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md` — say only things the code still
 * agrees with (issue #110).
 *
 * The README this replaced was the stock `React + TypeScript + Vite` template:
 * it documented an ESLint config for a project that lints with Biome, in a
 * monorepo it never mentioned. That is the failure mode these tests are aimed
 * at — prose that was true of something else and rotted quietly, because
 * nothing reads a README on the way to a green build.
 *
 * So the assertions are **derived** wherever a fact has a home in the code: the
 * dev ports come out of `vite.config.ts` and `packages/api/src/config.ts`, the
 * commands out of the root `package.json` scripts, the package list out of the
 * workspace manifests, the nav surfaces out of `app-sidebar.tsx`. A hardcoded
 * copy of any of those would rot the same way the template text did — it would
 * assert the README against the README.
 *
 * This lives under `src/test/` rather than beside a component because its
 * subject is the repo, not a component (same as
 * `bank-statement-scrubbed.test.ts`). Paths are cwd-relative — vitest runs from
 * the package root — so the repo root is `../../`.
 */

const ROOT = "../..";

const read = (path: string) => readFileSync(`${ROOT}/${path}`, "utf8");

const README = read("README.md");
const CONTRIBUTING = existsSync(`${ROOT}/CONTRIBUTING.md`)
	? read("CONTRIBUTING.md")
	: "";
const SECURITY = existsSync(`${ROOT}/SECURITY.md`) ? read("SECURITY.md") : "";
const LICENSE = existsSync(`${ROOT}/LICENSE`) ? read("LICENSE") : "";

const rootManifest = JSON.parse(read("package.json"));
const rootScripts: Record<string, string> = rootManifest.scripts ?? {};

/** The workspace packages, by their manifest `name`. */
const WORKSPACES = ["api", "sdk", "shared", "web"] as const;
const packageNames = WORKSPACES.map(
	(dir) => JSON.parse(read(`packages/${dir}/package.json`)).name as string,
);

/** `bun` subcommands that are the tool's own, not one of our scripts. */
const BUN_BUILTINS = new Set(["install", "add", "remove", "x", "create"]);

/** Every fenced code block in a markdown document, as raw text. */
function codeBlocks(markdown: string): string[] {
	return [...markdown.matchAll(/```[\w]*\n([\s\S]*?)```/g)].map((m) => m[1]);
}

interface BunCommand {
	/** Workspace name when the line carries `--filter`, else `null` (root). */
	pkg: string | null;
	script: string;
	line: string;
}

/**
 * Every `bun …` invocation a document tells the reader to run, as the script it
 * would resolve to. Builtins (`bun install`) resolve to nothing and are
 * dropped: the point is that no documented *script* is one the repo does not
 * define.
 */
function bunCommands(markdown: string): BunCommand[] {
	const out: BunCommand[] = [];

	for (const block of codeBlocks(markdown)) {
		for (const raw of block.split("\n")) {
			const line = raw.trim();
			if (!line.startsWith("bun ")) continue;

			const tokens = line.split(/\s+/).slice(1);
			if (BUN_BUILTINS.has(tokens[0])) continue;

			const rest = tokens[0] === "run" ? tokens.slice(1) : tokens;
			const filterAt = rest.indexOf("--filter");

			if (filterAt === -1) {
				const script = rest.find((token) => !token.startsWith("-"));
				if (script) out.push({ pkg: null, script, line });
				continue;
			}

			const after = rest.slice(filterAt + 2).filter((t) => !t.startsWith("-"));
			const script = after.at(-1);
			if (script) out.push({ pkg: rest[filterAt + 1], script, line });
		}
	}

	return out;
}

/**
 * Every relative link target in a markdown document, anchors stripped. External
 * links are not this repo's to keep alive; in-page anchors have no file.
 */
function relativeLinks(markdown: string): string[] {
	return [...markdown.matchAll(/\]\(([^)\s]+)\)/g)]
		.map((m) => m[1])
		.filter((href) => !/^(https?:|mailto:|#)/.test(href))
		.map((href) => href.split("#")[0])
		.filter(Boolean)
		.map((href) => href.replace(/^\.\//, ""));
}

/** Environment variable names a document names, as `UPPER_SNAKE` words. */
const envNames = (text: string) =>
	new Set(text.match(/\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b/g) ?? []);

/** The env names `packages/api/src/config.ts` actually reads. */
const apiConfigEnv = new Set(
	[
		...read("packages/api/src/config.ts").matchAll(/Config\.\w+\("(\w+)"\)/g),
	].map((m) => m[1]),
);

/** The env names the web app documents for itself. */
const webEnv = new Set(
	[...read("packages/web/.env.example").matchAll(/^(\w+)=/gm)].map((m) => m[1]),
);

/** The env names the operations docs already own (the `claude` CLI token). */
const opsEnv = new Set(
	[
		...read("docs/operations/claude-cli-dependency.md").matchAll(
			/\b([A-Z][A-Z0-9_]{3,})\b/g,
		),
	].map((m) => m[1]),
);

describe("README.md", () => {
	it("is no longer the Vite starter template", () => {
		expect(README).not.toContain("This template provides a minimal setup");
		expect(README).not.toContain("Expanding the ESLint configuration");
		expect(README.trimStart().startsWith("# mamen")).toBe(true);
	});

	it("names the linter the repo actually uses", () => {
		// The template's whole body was ESLint configuration; this repo lints with
		// Biome and has no ESLint config at all.
		expect(rootManifest.devDependencies["@biomejs/biome"]).toBeDefined();
		expect(README).toContain("Biome");
		expect(README).not.toContain("ESLint");
	});

	it("lists every workspace package and invents none", () => {
		for (const name of packageNames) expect(README).toContain(name);

		const mentioned = new Set(README.match(/@mamen\/[a-z-]+/g) ?? []);
		expect(
			[...mentioned].filter((n) => !packageNames.includes(n)),
		).toStrictEqual([]);
	});

	it("only tells the reader to run scripts that exist", () => {
		const commands = bunCommands(README);
		expect(commands.length).toBeGreaterThan(0);

		for (const { pkg, script, line } of commands) {
			const scripts = pkg
				? JSON.parse(
						read(
							`packages/${WORKSPACES.find((dir) => JSON.parse(read(`packages/${dir}/package.json`)).name === pkg)}/package.json`,
						),
					).scripts
				: rootScripts;

			expect(Object.keys(scripts), line).toContain(script);
		}
	});

	it("names the dev ports the code actually binds", () => {
		const webPort = read("packages/web/vite.config.ts").match(
			/port:\s*(\d+)/,
		)?.[1];
		const apiPort = read("packages/api/src/config.ts").match(
			/Config\.integer\("PORT"\)[\s\S]*?withDefault\((\d+)\)/,
		)?.[1];

		expect(webPort).toBeDefined();
		expect(apiPort).toBeDefined();
		expect(README).toContain(`localhost:${webPort}`);
		expect(README).toContain(`localhost:${apiPort}`);
	});

	it("names the pinned Bun version, not some other one", () => {
		const pinned = rootManifest.packageManager.split("@")[1];
		expect(README).toContain(pinned);
	});

	it("names no environment variable the code does not read", () => {
		const known = new Set([...apiConfigEnv, ...webEnv, ...opsEnv]);
		const named = [...envNames(README)].filter((name) => !known.has(name));

		expect(named).toStrictEqual([]);
	});

	it("warns that the API will not boot without the claude token", () => {
		// The single biggest clean-clone stumbling block: the token is checked when
		// `ClaudeCodeProdLive` is *built*, so an unset one takes the whole API down
		// at startup rather than breaking PDF import alone. If the server ever stops
		// providing that layer unconditionally, this reddens and the warning goes.
		expect(read("packages/api/src/server.ts")).toContain(
			"Layer.provide(ClaudeCodeProdLive)",
		);
		expect(README).toContain("CLAUDE_CODE_OAUTH_TOKEN");
	});

	it("names every navigation surface the app ships", () => {
		const sidebar = read("packages/web/src/components/app-sidebar.tsx");
		const nav = sidebar.slice(sidebar.indexOf("NAV_LINKS"));
		const labels = [...nav.matchAll(/label:\s*"([^"]+)"/g)].map((m) => m[1]);

		expect(labels.length).toBeGreaterThan(0);
		for (const label of labels) expect(README).toContain(label);
	});

	it("points at the agent-facing docs", () => {
		expect(README).toContain("CLAUDE.md");
		expect(README).toContain("CONTEXT-MAP.md");
	});
});

describe("LICENSE", () => {
	it("is MIT, held by the repository owner", () => {
		expect(LICENSE).toContain("MIT License");
		expect(LICENSE).toMatch(/Copyright \(c\) 2026 Lucas Riondel/);
		expect(LICENSE).toContain(
			'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND',
		);
	});

	it("agrees with the licence the root manifest declares", () => {
		expect(rootManifest.license).toBe("MIT");
	});
});

describe("CONTRIBUTING.md", () => {
	it("covers the three checks, and each is a real root script", () => {
		for (const script of ["typecheck", "test", "lint"]) {
			expect(rootScripts[script]).toBeDefined();
			expect(CONTRIBUTING).toContain(`bun run ${script}`);
		}
	});

	it("only tells the reader to run scripts that exist", () => {
		for (const { pkg, script, line } of bunCommands(CONTRIBUTING)) {
			const scripts = pkg
				? JSON.parse(
						read(
							`packages/${WORKSPACES.find((dir) => JSON.parse(read(`packages/${dir}/package.json`)).name === pkg)}/package.json`,
						),
					).scripts
				: rootScripts;

			expect(Object.keys(scripts), line).toContain(script);
		}
	});

	it("points at CLAUDE.md as the agent-facing version", () => {
		expect(CONTRIBUTING).toContain("CLAUDE.md");
	});
});

describe("SECURITY.md", () => {
	it("gives a reporting address", () => {
		expect(SECURITY).toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
	});

	it("says what an instance holds", () => {
		expect(SECURITY.toLowerCase()).toContain("bank statement");
		expect(SECURITY.toLowerCase()).toContain("transaction");
	});

	it("does not promise a bounty or a security team", () => {
		// Both are things this project does not have; the issue asks the file to be
		// honest about that rather than borrow a big project's boilerplate.
		expect(SECURITY).toMatch(/no bounty|not offer.{0,20}bounty/i);
	});
});

describe("every relative link in the four files", () => {
	it("resolves to a file that exists", () => {
		const broken: string[] = [];

		for (const [name, text] of [
			["README.md", README],
			["CONTRIBUTING.md", CONTRIBUTING],
			["SECURITY.md", SECURITY],
		] as const) {
			for (const href of relativeLinks(text)) {
				if (!existsSync(`${ROOT}/${href}`)) broken.push(`${name} -> ${href}`);
			}
		}

		expect(broken).toStrictEqual([]);
	});
});

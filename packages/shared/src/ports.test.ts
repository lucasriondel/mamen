import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as packageRoot from "./index";
import {
	API_DEV_PORT,
	DEMO_STACK_API_PORT,
	DEMO_STACK_WEB_PORT,
	DOCKER_HOST_PORT_FLOOR,
	LANDING_PAGE_DEV_PORT,
	PORT_TAKEN_ELSEWHERE,
	PORTS,
	portsOfKind,
	WEB_DEV_PORT,
} from "./ports";

/**
 * The registry's rows for mamen, held against the conventions that allocate
 * them and against the configs that bind them.
 *
 * The machine's registry (`~/dev/PORTS.md`) is outside this repo and no test
 * here can reach it, exactly as `app-base-path.test.ts` cannot reach the
 * reverse proxy. What a test *can* keep honest is that the numbers written
 * down are the numbers bound, that mamen's own rows do not collide, and that
 * nothing has crept back onto the port another app owns.
 *
 * Paths are cwd-relative — vitest runs from the package root.
 */

const source = readFileSync(
	fileURLToPath(new URL("./ports.ts", import.meta.url)),
	"utf8",
);

describe("the port table", () => {
	it("has a row for every port mamen binds, and no two on the same number", () => {
		const named = [
			WEB_DEV_PORT,
			LANDING_PAGE_DEV_PORT,
			API_DEV_PORT,
			DEMO_STACK_WEB_PORT,
			DEMO_STACK_API_PORT,
		];
		const rows = PORTS.map((row) => row.port);

		expect([...rows].sort()).toEqual([...named].sort());
		expect(new Set(rows).size).toBe(rows.length);
	});

	it("keeps mamen off the port the registry gives another app", () => {
		// The whole ticket: the landing page was pinned to 5100 against
		// someone else's row, so whichever app started second failed to boot.
		expect(PORT_TAKEN_ELSEWHERE).toBe(5100);
		expect(PORTS.map((row) => row.port)).not.toContain(PORT_TAKEN_ELSEWHERE);
	});

	it("allocates every row from the perso 5xxx range", () => {
		for (const row of PORTS) {
			expect(row.port).toBeGreaterThanOrEqual(5000);
			expect(row.port).toBeLessThan(6000);
		}
	});

	it("allocates the Docker host ports from 5400 up", () => {
		expect(DOCKER_HOST_PORT_FLOOR).toBe(5400);
		for (const row of portsOfKind("docker")) {
			expect(row.port).toBeGreaterThanOrEqual(DOCKER_HOST_PORT_FLOOR);
		}
	});

	it("keeps the demo stack clear of the ports `bun dev` binds", () => {
		// The stack has to come up while the dev servers are running: a demo
		// port that collided with one would only fail on the box it matters on.
		const dev = new Set(portsOfKind("dev").map((row) => row.port));
		for (const row of portsOfKind("docker")) {
			expect(dev.has(row.port)).toBe(false);
		}
		expect(dev.size).toBeGreaterThan(0);
	});

	it("says what answers on each port", () => {
		for (const row of PORTS) {
			expect(row.service).not.toBe("");
			expect(row.serves).not.toBe("");
		}
	});
});

describe("the configs that bind them", () => {
	// The three files that put a dev server on a host port. Each reads the
	// constant: a literal here is how the landing page ended up pinned to a
	// port the registry had already given away.
	const callers = {
		"landing-page vite.config.ts": "../landing-page/vite.config.ts",
		"web vite.config.ts": "../web/vite.config.ts",
		"api config.ts": "../api/src/config.ts",
	} as const;

	it.each(
		Object.entries(callers),
	)("%s reads its port from this module", (_name, path) => {
		const config = readFileSync(path, "utf8");

		expect(config).toMatch(/from "@mamen\/shared(\/ports)?"/);
		expect(config).toMatch(/_PORT\b/);
	});

	it.each(
		Object.entries(callers),
	)("%s states no port as a literal", (_name, path) => {
		const config = readFileSync(path, "utf8");

		// Comments included on purpose: a number in prose beside an
		// imported constant is the copy that goes stale first. Three
		// spellings, since the drift can be a bind, a proxy target or an
		// aside — but not every four-digit number (ADR ids are `0007`).
		expect(config).not.toMatch(/localhost:\d/);
		expect(config).not.toMatch(/\bport\s*[:=]\s*\d/i);
		expect(config).not.toMatch(/\b5\d{3}\b/);
	});
});

describe("the docs that quote them", () => {
	const README = readFileSync("../../README.md", "utf8");
	const CONTRIBUTING = readFileSync("../../CONTRIBUTING.md", "utf8");

	it("sends a reader to the port each dev server actually binds", () => {
		for (const row of portsOfKind("dev")) {
			expect(README).toContain(`localhost:${row.port}`);
		}
	});

	it("records every row, the reserved ones included", () => {
		// The reserved rows are the point of writing the table down at all: a
		// port nothing binds yet is exactly the one a later change picks by
		// accident.
		for (const row of PORTS) {
			// The table's row, matched as a table row: the dev servers are named
			// in the prose above it too, so "a line mentioning the number" is
			// not specific enough to be the row.
			const lines = README.split("\n").filter((line) =>
				line.startsWith(`| ${row.port} |`),
			);
			expect(lines, `no README row for ${row.port}`).toHaveLength(1);
			expect(lines[0]).toContain(row.service);
			expect(lines[0]).toContain(row.serves);
		}
	});

	it("leaves no doc pointing at the port the registry gives another app", () => {
		for (const doc of [README, CONTRIBUTING]) {
			expect(doc).not.toContain(`localhost:${PORT_TAKEN_ELSEWHERE}`);
		}
	});

	it("is the same set of dev ports the contributor guide names", () => {
		expect(CONTRIBUTING).toContain(`localhost:${WEB_DEV_PORT}`);
		expect(CONTRIBUTING).toContain(`localhost:${API_DEV_PORT}`);
	});
});

describe("the module", () => {
	it("imports nothing, so a build config can read it", () => {
		// `vite.config.ts` loads before any app code; a number must not drag
		// `effect` in behind it. Same constraint as `app-base-path.ts`.
		expect(source).not.toMatch(/^\s*import\b/m);
		expect(source).not.toMatch(/\brequire\(/);
	});

	it("is exported from the package root", () => {
		expect(packageRoot.PORTS).toBe(PORTS);
		expect(packageRoot.WEB_DEV_PORT).toBe(WEB_DEV_PORT);
		expect(packageRoot.API_DEV_PORT).toBe(API_DEV_PORT);
		expect(packageRoot.LANDING_PAGE_DEV_PORT).toBe(LANDING_PAGE_DEV_PORT);
		expect(packageRoot.DEMO_STACK_WEB_PORT).toBe(DEMO_STACK_WEB_PORT);
		expect(packageRoot.DEMO_STACK_API_PORT).toBe(DEMO_STACK_API_PORT);
	});

	it("has its own entry point, reachable without the package root", () => {
		// Import-free is only worth something if a consumer can reach the
		// module without pulling the root in behind it — and the root re-exports
		// the contract, which is `effect`. The `.ts` extension is deliberate:
		// Node's ESM resolver loads this from `vite.config.ts` and does no
		// extension guessing.
		const manifest = JSON.parse(readFileSync("package.json", "utf8"));
		expect(manifest.exports["./ports"]).toBe("./src/ports.ts");
	});
});

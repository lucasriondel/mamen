import { existsSync, readFileSync } from "node:fs";
import { LANDING_PAGE_DEV_PORT } from "@mamen/shared/ports";
import { describe, expect, it } from "vitest";

/**
 * The facts about this package that live in prose, held against the code that
 * decides them.
 *
 * The port is the one that matters most: it is pinned with `strictPort`
 * precisely so the number written down is the number bound, and the machine's
 * registry (`~/dev/PORTS.md`, outside this repo) is not something a test here
 * can reach. What this repo *can* keep honest is its own copy of the row
 * (`@mamen/shared/ports`) and its own README, which is the assertion below.
 *
 * Paths are cwd-relative — vitest runs from the package root.
 */

const read = (path: string) => readFileSync(path, "utf8");

const manifest = JSON.parse(read("package.json"));
const README = read("../../README.md");
const CLAUDE = read("../../CLAUDE.md");
const CONTEXT_MAP = read("../../CONTEXT-MAP.md");
const DEPLOY = read("../../DEPLOY.md");

describe("the documented dev server", () => {
	it("is on the port the config binds", () => {
		// The config binds the registry's constant (`vite-config.test.ts`
		// asserts that), so holding the README to the same constant holds it to
		// what a reader will actually find listening.
		expect(README).toContain(`localhost:${LANDING_PAGE_DEV_PORT}`);
	});

	it("tees to the log file CLAUDE.md tells an agent to read", () => {
		// The dev script writes it; CLAUDE.md is where an agent looks for it
		// before starting a second server on an already-bound port.
		const log = manifest.scripts.dev.match(/logs\/[\w.-]+\.log/)?.[0];
		expect(log).toBeDefined();
		expect(CLAUDE).toContain(log);
	});
});

describe("the package's own docs", () => {
	it("is on the context map, and the glossary it points at exists", () => {
		expect(CONTEXT_MAP).toContain("packages/landing-page/CONTEXT.md");
		expect(existsSync("CONTEXT.md")).toBe(true);
	});

	it("is deployable from what the operations doc says", () => {
		// The routing is the whole delivery here: an image nobody knows how to
		// point a domain at serves nothing. The runbook moved to the repo root
		// with issue #114 — it is one of the files a visitor reads.
		expect(DEPLOY).toContain("packages/landing-page/Dockerfile");
		expect(DEPLOY).toMatch(/landing-page/);
	});
});

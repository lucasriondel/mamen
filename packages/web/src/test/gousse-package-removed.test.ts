import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The private `@lucasriondel/gousse-ui` package is gone from the repo, and so is
 * everything that existed only to install it (issue #96).
 *
 * Every stylesheet and primitive mamen used is vendored source now (#92, #93,
 * #95), so the dependency supplies nothing — but *nothing imports it* and *it
 * is not installed* are different claims, and only the second one takes the
 * GitHub Packages credential out of the build. The subject here is the install
 * and build wiring: the manifest, the lockfile, the `.npmrc` that pointed the
 * `@lucasriondel` scope at a private registry, the `NODE_AUTH_TOKEN` the web
 * image passed it, the Vitest `server.deps.inline` workaround for the package's
 * extensionless ESM, and the runbook that told an operator to supply the token.
 * All of those are text, and all of them are re-introducible by a copy-paste.
 *
 * This lives under `src/test/` rather than beside a component because it has no
 * component subject — its subject is the repo. Paths are cwd-relative (vitest
 * runs from the package root), so the root is `../../`.
 */

const read = (path: string) => readFileSync(path, "utf8");

const PACKAGE = "@lucasriondel/gousse-ui";
const SCOPE = "@lucasriondel";
const TOKEN = "NODE_AUTH_TOKEN";

const webPackageJson = JSON.parse(read("package.json")) as {
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
};

/** Directories a source scan must never descend into. */
const PRUNED = new Set([
	".git",
	".turbo",
	"coverage",
	"dist",
	"graphify-out",
	"logs",
	"node_modules",
	"_bmad-output",
]);

/** Resolved dependency graphs — asserted separately, and megabytes each. */
const LOCKFILES = new Set(["bun.lock", "package-lock.json"]);

/** This file — it names what it forbids, so it cannot scan itself. */
const SELF = "packages/web/src/test/gousse-package-removed.test.ts";

/** Every non-pruned file in the repo, as `[repo-relative path, contents]`. */
function repoFiles(dir = "../..", prefix = ""): Array<[string, string]> {
	const out: Array<[string, string]> = [];

	for (const entry of readdirSync(dir)) {
		if (PRUNED.has(entry)) continue;

		const path = `${dir}/${entry}`;
		const relative = prefix ? `${prefix}/${entry}` : entry;

		if (statSync(path).isDirectory()) {
			out.push(...repoFiles(path, relative));
			continue;
		}
		if (LOCKFILES.has(relative) || relative === SELF) continue;

		out.push([relative, read(path)]);
	}

	return out;
}

describe("the npm dependency", () => {
	it("is absent from the web package's manifest", () => {
		expect(webPackageJson.dependencies).not.toHaveProperty(PACKAGE);
		expect(webPackageJson.devDependencies).not.toHaveProperty(PACKAGE);
	});

	it("is absent from the lockfile, so no install resolves it", () => {
		expect(read("../../bun.lock")).not.toContain(SCOPE);
	});
});

describe("the private registry credential", () => {
	it("leaves no .npmrc pointing the scope at GitHub Packages", () => {
		expect(existsSync("../../.npmrc")).toBe(false);
		expect(existsSync(".npmrc")).toBe(false);
	});

	it("is not passed to, or read by, the web image", () => {
		const dockerfile = read("Dockerfile");

		expect(dockerfile).not.toContain(TOKEN);
		expect(dockerfile).not.toContain(".npmrc");
	});

	it("is referenced by no build or deploy path left in the repo", () => {
		// Prose is exempt and scanned separately: ADR 0002 still *names* the
		// variable, because a decision record that erased the credential it once
		// required would be a worse record. Nothing in `.md` runs; the one
		// operational document that could mislead an operator — the runbook — has
		// its own assertion below.
		const offenders = repoFiles()
			.filter(([path]) => !path.endsWith(".md"))
			.filter(([, body]) => body.includes(TOKEN))
			.map(([path]) => path);

		expect(offenders).toStrictEqual([]);
	});
});

describe("the Vitest inline workaround", () => {
	it("is gone, along with the package it inlined", () => {
		const config = read("vitest.config.ts");

		expect(config).not.toContain(PACKAGE);
		expect(config).not.toMatch(/server\s*:/);
		expect(config).not.toContain("inline");
	});
});

describe("the deploy runbook", () => {
	it("no longer asks for the token, nor documents its 401", () => {
		const runbook = read("../../docs/operations/deploy.md");

		expect(runbook).not.toContain(TOKEN);
		expect(runbook).not.toContain(PACKAGE);
		expect(runbook).not.toContain("401");
	});
});

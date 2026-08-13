import { readdirSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * `radix-ui` is uninstalled, and nothing in this repo may reach for it again
 * (issue #102).
 *
 * Radix was never a decision — it arrived under the shadcn gap-fills that filled
 * the holes the gousse registry leaves. Tooltip (#99), Dialog (#100) and Popover
 * (#101) moved those three onto Base UI one at a time, which left the dependency
 * with no importer; this is where it stops being installed. **Base UI is the one
 * primitive system** (ADR 0004), and the failure mode that ADR names is not a
 * developer deciding otherwise — it is a `shadcn add` of a stock item, or a
 * snippet pasted from the shadcn docs, quietly reinstating a second one. `shadcn`
 * is still a devDependency here, and its default registry is Radix-based, so that
 * path is live rather than hypothetical.
 *
 * The subject is therefore text, not behaviour: the manifests, the lockfile and
 * every source file in the repo. All of it is re-introducible by a copy-paste,
 * and none of it would turn a behavioural test red.
 *
 * Scoped `@radix-ui/*` packages match the scan too — the umbrella is one way in,
 * `@radix-ui/react-popover` is another, and both mean two primitive systems. What
 * the scan deliberately does *not* reach is the resolved lockfile graph: `cmdk`
 * (untouched, and the last non-Base-UI primitive here) depends on four
 * `@radix-ui/*` packages, so Radix still ships in the bundle underneath the
 * command palette. What is retired is mamen's *own* dependency and mamen's *own*
 * imports, which is what the lockfile assertions below are careful to say.
 *
 * This lives under `src/test/` rather than beside a component because it has no
 * component subject — its subject is the repo. Paths are cwd-relative (vitest
 * runs from the package root), so the root is `../../`.
 */

const read = (path: string) => readFileSync(path, "utf8");

/** Matches the umbrella package and every `@radix-ui/*` member of the scope. */
const PACKAGE = "radix-ui";

type Manifest = {
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
};

const web = JSON.parse(read("package.json")) as Manifest;

const manifests: Array<[string, Manifest]> = [
	["packages/web/package.json", web],
	["package.json", JSON.parse(read("../../package.json"))],
	["packages/api/package.json", JSON.parse(read("../api/package.json"))],
	["packages/sdk/package.json", JSON.parse(read("../sdk/package.json"))],
	["packages/shared/package.json", JSON.parse(read("../shared/package.json"))],
];

/**
 * Directories a source scan must never descend into: build output, dependency
 * trees, and `.claude`, whose worktrees are whole checkouts of other branches —
 * a hit there is that branch's copy of the file, not a path this repo builds or
 * deploys from.
 */
const PRUNED = new Set([
	".claude",
	".git",
	".turbo",
	"coverage",
	"dist",
	"graphify-out",
	"logs",
	"node_modules",
	"_bmad-output",
]);

/**
 * The resolved dependency graph, asserted on its own below: it legitimately
 * names `@radix-ui/*` as `cmdk`'s transitive dependencies, so a substring scan
 * would read those as offenders.
 */
const LOCKFILE = "bun.lock";

/**
 * The tests that name what they forbid, so the scan cannot read them: this one
 * and its sibling, which holds ADR 0004's prose to the same rule.
 */
const SELF = new Set([
	"packages/web/src/test/radix-package-removed.test.ts",
	"packages/web/src/test/base-ui-adr.test.ts",
]);

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
		if (relative === LOCKFILE || SELF.has(relative)) continue;

		out.push([relative, read(path)]);
	}

	return out;
}

describe("the npm dependency", () => {
	it("is absent from every manifest in the workspace", () => {
		for (const [path, manifest] of manifests) {
			const declared = [
				...Object.keys(manifest.dependencies ?? {}),
				...Object.keys(manifest.devDependencies ?? {}),
			].filter((name) => name.includes(PACKAGE));

			expect([path, declared]).toStrictEqual([path, []]);
		}
	});

	it("is absent from the lockfile, so no install resolves the umbrella", () => {
		const lock = read(`../../${LOCKFILE}`);

		// A workspace's declared range, and the resolution it points at. Both are
		// written with the quote flush against the name, which is what keeps
		// `cmdk`'s `"@radix-ui/react-dialog"` entries out of the match.
		expect(lock).not.toMatch(/"radix-ui": "/);
		expect(lock).not.toContain('["radix-ui@');
	});

	it("keeps cmdk, which is not Radix's and is still in use", () => {
		expect(web.dependencies).toHaveProperty("cmdk");
		expect(read("src/components/ui/command.tsx")).toContain('from "cmdk"');
	});
});

describe("every file in the repo", () => {
	it("names the package nowhere outside prose", () => {
		// Prose is exempt here and scanned in `base-ui-adr.test.ts`, which holds it
		// to a tighter rule: exactly one document may name the retired package —
		// ADR 0004, whose subject *is* its retirement. Nothing in `.md` installs
		// or imports anything.
		const offenders = repoFiles()
			.filter(([path]) => !path.endsWith(".md"))
			.filter(([, body]) => body.includes(PACKAGE))
			.map(([path]) => path);

		expect(offenders).toStrictEqual([]);
	});
});

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The repo root carries no personal scratch file, and nothing points at the one
 * it used to carry (issue #136).
 *
 * `TODO.md` was a hand-kept list of about a dozen notes grouped under
 * general / ui / transactions / rules / import. Half of them had already
 * shipped by the time it was read again — an account column, the issuer name
 * beside the avatar, logo search, the rules' value matcher — and the file said
 * nothing about which half. That is the failure mode: a scratchpad at the root
 * of a public repo reads as the project's roadmap, and `CONTRIBUTING.md` is
 * explicit that there isn't one. The entries worth keeping are issues now,
 * where they can be triaged and closed; the rest are dropped.
 *
 * So the assertions are about the *root*, not about one filename: any of the
 * usual scratchpad names would read the same way to a visitor, and re-adding
 * the list as `NOTES.md` would undo the issue without tripping a check on
 * `TODO.md` alone. The second half scans the tree for references, since a
 * pointer to a file that no longer exists is its own kind of rot — the failure
 * `open-source-files.test.ts` guards for the root documents' links.
 *
 * This lives under `src/test/` rather than beside a component because its
 * subject is the repo, not a component (same as `bank-statement-scrubbed.test.
 * ts`). Paths are cwd-relative — vitest runs from the package root — so the
 * repo root is `../../`.
 */

const ROOT = "../..";

/** The file this issue retired, by the name it was tracked under. */
const RETIRED = "TODO.md";

/**
 * Names a scratchpad comes back under. Compared case-insensitively and without
 * an extension, so `todo.md`, `TODO`, `Notes.txt` and `SCRATCH.md` are all one
 * entry. `README`/`CONTRIBUTING`/`SECURITY`/`DEPLOY` are deliberately absent —
 * those are documents written for a reader, which is the distinction.
 */
const SCRATCH_NAMES = new Set([
	"todo",
	"todos",
	"notes",
	"scratch",
	"scratchpad",
	"ideas",
	"roadmap",
	"backlog",
]);

/**
 * Directories a repo scan must never descend into: build output, dependency
 * trees, and `.claude`, whose worktrees are whole checkouts of other branches —
 * a hit there is that branch's copy of a file, not a path this repo builds or
 * deploys from. Mirrors `bank-statement-scrubbed.test.ts`.
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
]);

/**
 * This file, which names the retired path in order to assert about it. Exempt
 * from the reference scan for the same reason the leaked statement's fixture is
 * exempt from the IBAN scan: the guard has to be able to say what it guards.
 */
const SELF = "packages/web/src/test/no-scratch-file.test.ts";

/** Every non-pruned file in the repo, as repo-relative paths. */
function repoFiles(dir = ROOT, prefix = ""): string[] {
	const out: string[] = [];

	for (const entry of readdirSync(dir)) {
		if (PRUNED.has(entry)) continue;

		const path = `${dir}/${entry}`;
		const relative = prefix ? `${prefix}/${entry}` : entry;

		if (statSync(path).isDirectory()) {
			out.push(...repoFiles(path, relative));
			continue;
		}
		out.push(relative);
	}

	return out;
}

/**
 * The text of a file, or `null` if it is binary — a NUL byte, the same
 * heuristic `git diff` uses. Lockfiles and images have nothing to say about a
 * markdown file at the root.
 */
function textOf(path: string): string | null {
	const buffer = readFileSync(`${ROOT}/${path}`);
	return buffer.includes(0) ? null : buffer.toString("utf8");
}

/** A file's name with its extension dropped, lowercased. */
const stem = (name: string) => name.replace(/\.[^.]*$/, "").toLowerCase();

describe("the retired TODO.md", () => {
	it("is gone from the repo root", () => {
		expect(existsSync(`${ROOT}/${RETIRED}`)).toBe(false);
	});

	it("has not come back under another scratchpad name", () => {
		// A root-level `NOTES.md` is the same file with the check routed around:
		// the objection was never to the word "todo", it was to a private list
		// sitting where a visitor reads the project's intentions.
		const found = readdirSync(ROOT, { withFileTypes: true })
			.filter((entry) => entry.isFile() && SCRATCH_NAMES.has(stem(entry.name)))
			.map((entry) => entry.name);

		expect(found).toStrictEqual([]);
	});

	it("is referenced by no file in the repo", () => {
		// Including the ones a grep for a broken *link* would miss — a bare
		// mention in prose or in an agent instruction file still sends a reader
		// looking for a file that isn't there.
		const referrers = repoFiles()
			.filter((path) => path !== SELF)
			.filter((path) => textOf(path)?.includes(RETIRED));

		expect(referrers).toStrictEqual([]);
	});
});

describe("CONTRIBUTING.md", () => {
	it("still says there is no roadmap, which is why the root carries none", () => {
		// The reason the scratchpad had to go, kept next to the check that
		// enforces it: if this project ever does publish a roadmap, this test is
		// the thing that should be reconsidered rather than routed around.
		expect(readFileSync(`${ROOT}/CONTRIBUTING.md`, "utf8")).toContain(
			"no roadmap",
		);
	});
});

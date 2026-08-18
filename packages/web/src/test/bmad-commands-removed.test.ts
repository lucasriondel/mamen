import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Nothing in this repo drives BMAD any more (issue #134).
 *
 * `_bmad/` and `_bmad-output/` — the framework's installed module tree and its
 * scratch directory — were deleted some commits ago, but the 46 slash-commands
 * under `.cursor/commands/bmad/` that invoked them were left behind. A command
 * whose workflow file no longer exists is worse than no command: it is offered
 * by the editor, it looks supported, and it fails only once someone runs it.
 *
 * So the subject is the whole set, not the directory: the commands, and every
 * remaining mention of the directories they pointed at. Config that still
 * excludes a path nothing writes — a lint ignore, a Docker ignore — reads as
 * evidence the tooling is still around, which is exactly the wrong signal for
 * the next person deciding whether to delete something.
 *
 * This lives under `src/test/` rather than beside a component because it has no
 * component subject — its subject is the repo. Paths are cwd-relative (vitest
 * runs from the package root), so the root is `../../`.
 */

const ROOT = "../..";

/** Where the orphaned commands sat. */
const COMMANDS = ".cursor/commands/bmad";

/** The directories they invoked, both already deleted. */
const MODULES = "_bmad";
const OUTPUT = "_bmad-output";

/**
 * The marker a leftover mention carries. Matched case-insensitively: the prose
 * spells it `BMAD`, the paths spell it `bmad`.
 */
const MARKER = /bmad/i;

/**
 * Directories a repo scan must never descend into: build output, dependency
 * trees, generated graph output, and `.claude`, whose worktrees are whole
 * checkouts of other branches — a hit there is that branch's copy of a file,
 * not a path this repo builds or deploys from. `.cursor` is deliberately *not*
 * pruned: it is where the commands lived, so it is where a re-add would land.
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
 * The test that names what it forbids, exempt from both scans below: it says
 * the word in its prose *and* in its own filename, so it is the one tracked
 * path that may match and the one file whose contents may.
 */
const SELF = "packages/web/src/test/bmad-commands-removed.test.ts";

/**
 * The text of a file, or `null` if it is binary. A NUL byte is the same
 * heuristic `git diff` uses, and refusing to read binary keeps a chance run of
 * bytes out of a substring scan.
 */
function textOf(path: string): string | null {
	const buffer = readFileSync(path);
	return buffer.includes(0) ? null : buffer.toString("utf8");
}

/** Every non-pruned text file in the repo, as `[repo-relative path, contents]`. */
function repoFiles(dir = ROOT, prefix = ""): Array<[string, string]> {
	const out: Array<[string, string]> = [];

	for (const entry of readdirSync(dir)) {
		if (PRUNED.has(entry)) continue;

		const path = `${dir}/${entry}`;
		const relative = prefix ? `${prefix}/${entry}` : entry;

		if (statSync(path).isDirectory()) {
			out.push(...repoFiles(path, relative));
			continue;
		}
		if (relative === SELF) continue;

		const text = textOf(path);
		if (text !== null) out.push([relative, text]);
	}

	return out;
}

describe("the orphaned BMAD commands", () => {
	it("are gone from the working tree", () => {
		expect(existsSync(`${ROOT}/${COMMANDS}`)).toBe(false);
	});

	it("are tracked by no file, under `.cursor` or anywhere else", () => {
		const tracked = execFileSync("git", ["ls-files"], {
			cwd: ROOT,
			encoding: "utf8",
		})
			.split("\n")
			.filter((path) => path !== SELF)
			.filter((path) => MARKER.test(path));

		expect(tracked).toStrictEqual([]);
	});
});

describe("the directories they invoked", () => {
	it("are absent from the working tree", () => {
		expect(existsSync(`${ROOT}/${MODULES}`)).toBe(false);
		expect(existsSync(`${ROOT}/${OUTPUT}`)).toBe(false);
	});

	it("are named by no remaining file in the repo", () => {
		// Including the ignore lists. An exclusion for a path nothing writes is
		// dead config, and dead config is how a deleted tool looks installed.
		const offenders = repoFiles()
			.filter(([, body]) => MARKER.test(body))
			.map(([path]) => path);

		expect(offenders).toStrictEqual([]);
	});
});

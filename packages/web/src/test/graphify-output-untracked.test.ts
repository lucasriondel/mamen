import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

/**
 * `graphify-out/` is generated, so the repo does not carry it (issue #134).
 *
 * It is a knowledge-graph dump — 178 files, ~5.7 MB — rebuilt from the source
 * beside it. Tracking regenerable output costs a clone the download and costs
 * every regeneration a diff: the tool rewrites the whole directory, so a run
 * that changed nothing meaningful still shows up as hundreds of modified files,
 * and the noise is what makes the next real change easy to miss.
 *
 * *Deleted* and *ignored* are different claims and this file needs both. The
 * directory keeps being produced locally — that is the point of the tool — so
 * the working tree is expected to hold it; what must be true is that git never
 * sees it, whether it is there or not.
 *
 * This lives under `src/test/` rather than beside a component because it has no
 * component subject — its subject is the repo. Paths are cwd-relative (vitest
 * runs from the package root), so the root is `../../`.
 */

const ROOT = "../..";

const DIRECTORY = "graphify-out";

/** A file the tool writes, used to check the rule reaches inside the directory. */
const AN_OUTPUT_FILE = `${DIRECTORY}/graph.json`;

const git = (...args: string[]) =>
	execFileSync("git", args, { cwd: ROOT, encoding: "utf8" });

/** `git check-ignore` exits 0 when a path is excluded, 1 when it is not. */
function isIgnored(path: string): boolean {
	try {
		execFileSync("git", ["check-ignore", "-q", "--", path], { cwd: ROOT });
		return true;
	} catch {
		return false;
	}
}

describe("the generated graph output", () => {
	it("is tracked by no file at all", () => {
		const tracked = git("ls-files", "--", DIRECTORY)
			.split("\n")
			.filter(Boolean);

		expect(tracked).toStrictEqual([]);
	});

	it("is ignored, both as a directory and file by file", () => {
		expect(isIgnored(DIRECTORY)).toBe(true);
		expect(isIgnored(AN_OUTPUT_FILE)).toBe(true);
		expect(isIgnored(`${DIRECTORY}/cache/anything.json`)).toBe(true);
	});

	it("never dirties the working tree, however the tool leaves it", () => {
		// `--untracked-files=all` is what makes this mean something: without it a
		// wholly untracked directory reports as one entry, so an unignored
		// `graphify-out/` could pass while every file inside it is unignored too.
		//
		// Only the untracked entries are read. Index state is not the subject — a
		// staged deletion under this path is what *untracking* it looks like while
		// the change is in flight, and a staged re-*addition* is already the first
		// test's, which reads the index.
		const untracked = git(
			"status",
			"--porcelain",
			"--untracked-files=all",
			"--",
			DIRECTORY,
		)
			.split("\n")
			.filter((line) => line.startsWith("??"));

		expect(untracked).toStrictEqual([]);
	});
});

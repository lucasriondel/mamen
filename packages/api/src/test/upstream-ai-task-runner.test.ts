import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The upstream artifact in `docs/upstream/` against itself (issue #123).
 *
 * `ai-task-runner-effect` has no remote and is not in this repository, so the
 * change that unblocks hosted PDF extraction ships here as a document plus a
 * patch, for someone to apply and publish. That makes the pair the deliverable
 * — and a deliverable nobody can run is exactly the thing that rots: a file
 * added to the patch and not to the document reads as "that file was not
 * touched", and a version bumped in one and not the other publishes the wrong
 * number.
 *
 * So the document's claims are *derived* from the patch here rather than
 * restated: the file table is matched against the patch's own `diff --git`
 * lines, the version against the hunk that bumps it, and the test count against
 * the tests the patch adds.
 *
 * The last block is the one that matters most. It ties the document's
 * "not published" banner to whether `packages/api` actually depends on the
 * package, so the day someone lands `0.2.0` and adds the dependency, this test
 * tells them the status line is now a lie.
 *
 * Paths are cwd-relative — vitest runs from the package root.
 */

const ROOT = "../..";
const read = (path: string) => readFileSync(path, "utf8");

const PACKAGE_NAME = "ai-task-runner-effect";
const UPSTREAM = `${ROOT}/docs/upstream`;
const DOC = read(`${UPSTREAM}/${PACKAGE_NAME}-document-parts.md`);

/**
 * The patch the document points at, by name — there is only one, and the
 * document naming it is how the two stay a pair. Read eagerly so a document
 * that names nothing fails here rather than as eight confusing assertions.
 */
const PATCH_NAME =
	DOC.match(new RegExp(`\`(${PACKAGE_NAME}-[\\d.]+\\.patch)\``))?.[1] ?? "";
const PATCH = read(`${UPSTREAM}/${PATCH_NAME}`);

/** Every path the patch touches, from its own headers. */
const patchedFiles = [...PATCH.matchAll(/^diff --git a\/(\S+) b\/\S+$/gm)].map(
	(m) => m[1] as string,
);

/** The paths the document's file table names, in backticks in the first cell. */
const documentedFiles = [
	...DOC.matchAll(/^\|\s*`([^`]+)`\s*\|[^|]*\|\s*$/gm),
].map((m) => m[1] as string);

/** The version the patch's `package.json` hunk publishes. */
const patchedVersion = PATCH.match(/^\+\s*"version": "([^"]+)"/m)?.[1] ?? "";

/** Every `test("…")` the patch adds, across the test files it creates. */
const addedTests = [...PATCH.matchAll(/^\+\s*test\(/gm)].length;

/** The test files the patch creates. */
const addedTestFiles = patchedFiles.filter((f) => f.endsWith(".test.ts"));

const apiManifest = JSON.parse(read(`${ROOT}/packages/api/package.json`)) as {
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
};
const apiDependsOnPackage =
	PACKAGE_NAME in (apiManifest.dependencies ?? {}) ||
	PACKAGE_NAME in (apiManifest.devDependencies ?? {});

describe("the patch is the artifact the document describes", () => {
	it("names a patch that exists beside it", () => {
		expect(PATCH_NAME).not.toBe("");
		expect(existsSync(`${UPSTREAM}/${PATCH_NAME}`)).toBe(true);
	});

	it("touches at least the module, the barrel and the manifest", () => {
		expect(patchedFiles).toContain("src/prompt.ts");
		expect(patchedFiles).toContain("index.ts");
		expect(patchedFiles).toContain("package.json");
	});

	it("documents every file it touches, and touches every file it documents", () => {
		expect([...documentedFiles].sort()).toEqual([...patchedFiles].sort());
	});
});

describe("the version to publish is written once", () => {
	it("bumps the manifest to a version the patch's own filename carries", () => {
		expect(patchedVersion).not.toBe("");
		expect(basename(PATCH_NAME)).toBe(
			`${PACKAGE_NAME}-${patchedVersion}.patch`,
		);
	});

	it("is the version the document tells you to publish", () => {
		expect(DOC).toContain(`Publish \`${patchedVersion}\``);
	});

	it("is the range the document tells mamen to depend on", () => {
		const [major, minor] = patchedVersion.split(".");

		expect(DOC).toContain(`bun add ${PACKAGE_NAME}@^${major}.${minor}.0`);
	});
});

describe("the document's count of the suite is the patch's", () => {
	it("claims exactly the tests the patch adds", () => {
		expect(addedTests).toBeGreaterThan(0);
		expect(DOC).toContain(
			`**\`bun test\`: ${addedTests} pass, 0 fail** across ${addedTestFiles.length}`,
		);
	});
});

describe("the status line tracks whether mamen can actually depend on it", () => {
	it("says it is unpublished only while packages/api does not depend on it", () => {
		const saysUnpublished = DOC.includes("not published");

		expect(saysUnpublished).toBe(!apiDependsOnPackage);
	});
});

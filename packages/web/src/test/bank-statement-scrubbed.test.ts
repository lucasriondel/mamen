import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * No real bank statement is tracked in this repo, and nothing may put one back
 * (issue #108).
 *
 * A genuine Green-Got export — real IBANs, counterparty names, amounts and
 * payment references — was committed at the repo root, and the import fixture
 * under `__fixtures__/` turned out to be a *byte-identical copy* of it rather
 * than the synthetic sample its name suggests. That is the failure this file
 * exists for: the leak was not one careless `git add` of an obviously-named
 * file, it was that file plus a second copy sitting where a fixture belongs,
 * where nobody would look twice.
 *
 * So the subject is content, not paths. The scan hashes every file in the repo
 * and compares against the digest of the statement, which catches a re-add
 * under any name, in any directory, with any extension. A digest names nothing
 * it protects — putting the IBAN itself in an assertion would re-commit the
 * thing being scrubbed.
 *
 * What this cannot see is history: these tests read the working tree, and the
 * ~500 commits behind it are the other half of the leak. That half is
 * `scripts/scrub-bank-statements.sh`, which rewrites history and verifies
 * itself; it is a one-off rewrite plus a force-push, not something a test run
 * can assert against the repo it is running in.
 *
 * This lives under `src/test/` rather than beside a component because it has no
 * component subject — its subject is the repo. Paths are cwd-relative (vitest
 * runs from the package root), so the root is `../../`.
 */

const ROOT = "../..";

/**
 * SHA-256 of the statement that was tracked here. The file is gone from the
 * working tree and the digest is all that is left of it — enough to recognise a
 * copy, useless for reconstructing one.
 */
const LEAKED_SHA256 =
	"0f091c60e3d03e94cf640660d883cff8dcd323ad63fdf6c9719bad81caaef871";

/** Where it sat, under the bank's own download filename. */
const STATEMENT = "relevé_de_comptes_du_01.01.2026_au_31.01.2026.csv";

/** The import fixture that was a copy of it, now synthetic. */
const FIXTURE = "src/features/import/__fixtures__/green-got-sample.csv";

/** The same fixture from the repo root, which is how the scans below see it. */
const FIXTURE_FROM_ROOT = `packages/web/${FIXTURE}`;

/**
 * A French IBAN: `FR`, two check digits, then 23 more characters. Written as a
 * pattern rather than a literal so this file carries no account number of its
 * own — including a synthetic one, which the scans below would then have to
 * exempt.
 */
const frenchIbans = (text: string) => text.match(/FR[0-9A-Z]{25}/g) ?? [];

/**
 * Every synthetic IBAN in the tree starts with this. `99999` is not an
 * allocated French bank code and the check digits do not validate, so a string
 * carrying it cannot be an account that exists; a real statement pasted in
 * fails both halves.
 */
const SYNTHETIC_IBAN_PREFIX = "FR7699999";

/**
 * Directories a repo scan must never descend into: build output, dependency
 * trees, and `.claude`, whose worktrees are whole checkouts of other branches —
 * a hit there is that branch's copy of a file, not a path this repo builds or
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
]);

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

const bytes = (path: string) => readFileSync(`${ROOT}/${path}`);

const sha256 = (path: string) =>
	createHash("sha256").update(bytes(path)).digest("hex");

/**
 * The text of a file, or `null` if it is binary. A NUL byte is the same
 * heuristic `git diff` uses, and it matters here because the IBAN pattern is
 * loose enough (`FR` then 25 of `[0-9A-Z]`) that compressed bytes can satisfy
 * it by accident. A statement is text; refusing to read binary costs nothing
 * the digest scan above does not already cover.
 */
function textOf(path: string): string | null {
	const buffer = bytes(path);
	return buffer.includes(0) ? null : buffer.toString("utf8");
}

/** `git check-ignore` exits 0 when a path is excluded, 1 when it is not. */
function isIgnored(path: string): boolean {
	try {
		execFileSync("git", ["check-ignore", "-q", "--", path], { cwd: ROOT });
		return true;
	} catch {
		return false;
	}
}

describe("the tracked bank statement", () => {
	it("is absent from the working tree", () => {
		expect(existsSync(`${ROOT}/${STATEMENT}`)).toBe(false);
	});

	it("left no CSV at the repo root at all", () => {
		// The root is where a bank's own download lands, and nothing in this
		// monorepo legitimately keeps data there — fixtures live beside the parser
		// that reads them.
		const atRoot = readdirSync(ROOT).filter((entry) =>
			entry.toLowerCase().endsWith(".csv"),
		);

		expect(atRoot).toStrictEqual([]);
	});

	it("has no copy anywhere in the repo, under any name", () => {
		const copies = repoFiles().filter((path) => sha256(path) === LEAKED_SHA256);

		expect(copies).toStrictEqual([]);
	});
});

describe("the Green-Got import fixture", () => {
	it("still ships, so the parser keeps a file to be tested against", () => {
		expect(existsSync(FIXTURE)).toBe(true);
	});

	it("carries only synthetic account numbers", () => {
		const ibans = frenchIbans(readFileSync(FIXTURE, "utf8"));

		// It is a bank statement fixture; if it stops carrying IBANs entirely the
		// assertion below passes vacuously and stops meaning anything.
		expect(ibans.length).toBeGreaterThan(0);

		const real = ibans.filter(
			(iban) => !iban.startsWith(SYNTHETIC_IBAN_PREFIX),
		);
		expect(real).toStrictEqual([]);
	});
});

describe("every text file in the repo", () => {
	it("carries no account number outside the fixture", () => {
		const offenders = repoFiles()
			.filter((path) => path !== FIXTURE_FROM_ROOT)
			.filter((path) => frenchIbans(textOf(path) ?? "").length > 0);

		expect(offenders).toStrictEqual([]);
	});
});

describe(".gitignore", () => {
	it("blocks bank-statement CSVs at the repo root", () => {
		expect(isIgnored(STATEMENT)).toBe(true);
		expect(isIgnored("statement.csv")).toBe(true);
		expect(isIgnored("relevé_de_comptes_du_01.02.2026_au_28.02.2026.csv")).toBe(
			true,
		);
	});

	it("blocks the same statement wherever it is dropped, not just at the root", () => {
		// The copy that mattered was not at the root — it was four directories
		// down, named like a fixture.
		expect(isIgnored(`packages/web/src/${STATEMENT}`)).toBe(true);
		expect(isIgnored("packages/api/releve_de_comptes_janvier.csv")).toBe(true);
	});

	it("leaves the synthetic fixture tracked", () => {
		expect(isIgnored(FIXTURE_FROM_ROOT)).toBe(false);
	});
});

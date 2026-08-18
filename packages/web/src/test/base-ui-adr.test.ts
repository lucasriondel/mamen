import { readdirSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * ADR 0004 records the decision the conversions arrived at (issue #102).
 *
 * ADR 0003 wrote down where gousse's source comes from, and listed "two
 * primitive systems" as a consequence it lived with. There is one now, and two
 * things follow that no existing record states: that mamen depends on **Base UI
 * alone**, and that `popover`, `dialog` and `tooltip` — the three converted
 * gap-fills — are mamen's own source rather than vendored items, because the
 * registry publishes no such items to vendor. The second is exactly the question
 * ADR 0003's two-formatting-regimes rule makes a reader ask about those files.
 *
 * Asserted as text because prose is the artefact: nothing here renders, and the
 * failure mode is a later change quietly making the record false — a second
 * primitive library installed, or one of the three re-described as a vendored
 * item someone may overwrite with `shadcn add`. The companion guard,
 * `radix-package-removed.test.ts`, holds the code to the same claims; this file
 * holds the prose, and is the reason `.md` is exempt over there.
 *
 * Paths are cwd-relative — vitest runs from the package root, so the repo root
 * is `../../`.
 */

const read = (path: string) => readFileSync(path, "utf8");

const ADR_DIR = "docs/adr";
const VENDORING = `${ADR_DIR}/0003-gousse-is-vendored-from-a-shadcn-registry.md`;
const CURRENT = `${ADR_DIR}/0004-base-ui-is-the-only-primitive-system.md`;

const current = read(CURRENT);

/**
 * Prose wraps at 80 columns and carries emphasis markers; a phrase does not.
 * Assertions about *what a sentence says* read this, so re-wrapping a paragraph
 * — or bolding a clause — is never a failure.
 */
const flatten = (source: string) =>
	source.replace(/[*`]/g, "").replace(/\s+/g, " ");

const currentProse = flatten(current);

const PACKAGE = "radix-ui";

/** Build output, dependency trees and agent scratch — none of it is our prose. */
const PRUNED = new Set([
	".claude",
	".cursor",
	".git",
	".sandcastle",
	".turbo",
	"coverage",
	"dist",
	"graphify-out",
	"logs",
	"node_modules",
]);

/** This file — it names what it forbids, so it cannot scan itself. */
const SELF = "packages/web/src/test/base-ui-adr.test.ts";

/**
 * The one document allowed to name the retired package: the record of its
 * retirement. Every other mention is a repo that still describes itself as
 * running on two primitive systems.
 */
const RETIREMENT = `packages/web/${CURRENT}`;

/** Every markdown file in the repo, as `[repo-relative path, contents]`. */
function repoDocs(dir = "../..", prefix = ""): Array<[string, string]> {
	const out: Array<[string, string]> = [];

	for (const entry of readdirSync(dir)) {
		if (PRUNED.has(entry)) continue;

		const path = `${dir}/${entry}`;
		const relative = prefix ? `${prefix}/${entry}` : entry;

		if (statSync(path).isDirectory()) {
			out.push(...repoDocs(path, relative));
			continue;
		}
		if (!relative.endsWith(".md") || relative === SELF) continue;

		out.push([relative, read(path)]);
	}

	return out;
}

describe("the record", () => {
	it("carries the repo's status header and the issue it came from", () => {
		expect(current).toContain("**Status**: accepted (issue #102).");
		expect(current).toContain(
			"[ADR 0003](./0003-gousse-is-vendored-from-a-shadcn-registry.md)",
		);
	});

	it("names Base UI as the only primitive system mamen depends on", () => {
		expect(currentProse).toMatch(/only primitive system/i);
		expect(currentProse).toContain("@base-ui-components/react");
		expect(currentProse).toContain("1.0.0-rc.0");
	});

	it("states that the package is uninstalled, and names it", () => {
		expect(currentProse).toContain(PACKAGE);
		expect(currentProse).toMatch(/uninstalled/i);
	});

	it("explains why the three primitives are mamen's own source", () => {
		for (const primitive of ["popover", "dialog", "tooltip"]) {
			expect(currentProse).toContain(`${primitive}.tsx`);
		}

		expect(currentProse).toMatch(/registry (publishes|ships) no/i);
		expect(currentProse).toContain("shadcn add @gousse/");
		expect(currentProse).toMatch(/mamen-owned source/i);
	});

	it("is honest about what still ships underneath cmdk", () => {
		expect(currentProse).toContain("cmdk");
		expect(currentProse).toContain("@radix-ui/react-dialog");
		expect(currentProse).toMatch(/transitive/i);
	});

	it("names the style a stock `shadcn add` now resolves against", () => {
		// The record used to describe the stock registry as belonging to the
		// retired system full stop. It is the `style` field that decides which
		// variant a pull resolves against, and that field is `base-nova` now
		// (issue #103) — so the record has to say so, and to say what the
		// emitted source still would not compile against here.
		expect(currentProse).toContain("components.json");
		expect(currentProse).toContain("base-nova");
		expect(currentProse).toContain("@base-ui/react");
	});

	it("points at the tests that enforce it", () => {
		for (const test of [
			"src/test/radix-package-removed.test.ts",
			"src/components/ui/base-ui-primitives.test.tsx",
		]) {
			expect(current).toContain(test);
		}
	});
});

describe("every other document", () => {
	it("names the retired package nowhere in the repo", () => {
		const offenders = repoDocs()
			.filter(([path]) => path !== RETIREMENT)
			.filter(([, body]) => body.includes(PACKAGE))
			.map(([path]) => path);

		expect(offenders).toStrictEqual([]);
	});

	it("leaves ADR 0003 describing the vendoring, not this decision", () => {
		// 0003 is not superseded — where gousse's source comes from is still true,
		// and its seam bullet is the history this record continues from. What it
		// may no longer do is state the seam's *enforcement*, which moved here.
		expect(read(VENDORING)).toContain(
			"[ADR 0004](./0004-base-ui-is-the-only-primitive-system.md)",
		);
	});
});

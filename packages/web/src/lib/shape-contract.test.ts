import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The round shape contract (issue #97), enforced across the whole app.
 *
 * gousse's vendored primitives already carry it — `Button` and `Input` are
 * pills, `Textarea` takes the generous box corner — but the kit
 * doesn't ship a table, a dialog, a popover, a tooltip or any of mamen's own
 * composites, and those were still drawn on the smaller `rounded-sm` /
 * `rounded-md` / `rounded-lg` steps. One app cannot read as one design while its
 * two primitive systems disagree about what a corner is.
 *
 * The scale, after this issue:
 *
 * - **`rounded-full`** — anything control-shaped: buttons, single-line fields
 *   and selects, toggles, segmented options, menu and list rows, chips, badges,
 *   icon-only hit targets, and the focus ring of a control that has no
 *   background of its own.
 * - **`rounded-2xl`** — panels, cards, overlays (dialog, popover, tooltip,
 *   command palette) and the outer frame of a table or list. Containers hold
 *   content; they are not controls.
 * - **`rounded-xl`** — a box nested *inside* one of those, one step down so the
 *   corners nest instead of colliding.
 *
 * Enforced as text, and per file rather than repo-wide, because the failure
 * mode is silent: a new component copied from an old one re-introduces
 * `rounded-md` and nothing renders differently enough to notice. The
 * {@link EXCEPTIONS} below are the whole of what may still carry a smaller
 * corner — which is what makes each of them a decision rather than an omission.
 *
 * Paths are cwd-relative, as in the vendoring tests: vitest runs from the
 * package root.
 */

/** `rounded`, `rounded-sm|md|lg`, or an arbitrary `rounded-[…]`. */
const SMALLER_STEP = /\brounded(?:-(?:sm|md|lg|\[[^\]]+\]))?(?![\w-])/g;

/**
 * Files allowed to keep a smaller corner, with the count they may keep. All but
 * the first are a **mark**: a glyph-sized square where `rounded-full` would turn
 * the element into a dot and the box corner would swallow it whole. The first is
 * vendored source we do not edit, so its corner is upstream's decision.
 */
const EXCEPTIONS: Record<string, { count: number; why: string }> = {
  "src/components/ui/sidebar.tsx": {
    count: 1,
    // The one exception that is not a mark. gousse's row was a pill when #97
    // wrote this list; the registry's current source draws it as a `rounded-lg`
    // slab under a hue fill and a left active bar (#105). The file is upstream
    // source vendored untouched — restating the shape here would fork it, and
    // the next `shadcn add` would silently undo the fork.
    why: "gousse's own source, unedited (#105) — the registry's row corner, not ours to restate",
  },
  "src/components/ui/checkbox.tsx": {
    count: 1,
    why: "gousse's own source, unedited (#93) — the 16px tick box is the kit's shape, not ours to restate",
  },
  "src/components/ui/account-multi-select.tsx": {
    count: 1,
    why: "the 16px tick mark mirrors Checkbox above, so the two read as one control",
  },
  "src/features/transactions/transaction-cells.tsx": {
    count: 1,
    why: "the 16px override marker — a tinted square holding a pin glyph, not a surface",
  },
  "src/components/app-sidebar.tsx": {
    count: 1,
    why: "the 24px brand icon — a circle crop would cut the artwork",
  },
  "src/components/ui/provider-mark.tsx": {
    count: 1,
    why: "gousse's own source, unedited (#120) — the 30px provider mark, a squircle the kit draws so four vendor logos read as one row",
  },
};

/** Every non-test `.ts`/`.tsx` under `src`, so nothing can hide. */
function sourceFiles(): string[] {
  return readdirSync("src", { recursive: true, encoding: "utf8" })
    .filter((entry) => /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry))
    .map((entry) => `src/${entry}`);
}

/** Class names only: a doc comment may name a step it is explaining. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function smallerSteps(path: string): string[] {
  return withoutComments(readFileSync(path, "utf8")).match(SMALLER_STEP) ?? [];
}

describe("the round shape contract", () => {
  it("leaves no smaller corner outside the documented exceptions", () => {
    const offenders = sourceFiles()
      .filter((path) => !(path in EXCEPTIONS))
      .filter((path) => smallerSteps(path).length > 0);

    expect(offenders).toStrictEqual([]);
  });

  it("holds each exception to the marks it was granted", () => {
    const counts = Object.fromEntries(
      Object.keys(EXCEPTIONS).map((path) => [path, smallerSteps(path).length]),
    );

    expect(counts).toStrictEqual(
      Object.fromEntries(Object.entries(EXCEPTIONS).map(([path, { count }]) => [path, count])),
    );
  });
});

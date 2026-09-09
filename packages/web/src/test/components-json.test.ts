import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * `components.json` is configuration for the *next* registry pull (issue #103).
 *
 * It writes down nothing about the source already in the tree — it decides what
 * `shadcn add` will fetch and where the CLI will put it. Two halves, each with
 * its own failure mode:
 *
 * - **`style`** picks which variant of the stock `@shadcn` registry a plain
 *   `shadcn add <name>` resolves against: that registry's URL template is
 *   `.../r/styles/{style}/{name}.json`, and `{style}` is this field. The
 *   `new-york` family is built on the primitive system ADR 0004 retired, so
 *   leaving it declared meant the next gap-fill arrived on the wrong one — a
 *   second primitive system installed by a command nobody thinks of as a
 *   decision. `base-nova` is the Base UI variant, and the one miel uses against
 *   the same gousse registry.
 * - **`registries` and `aliases`** are where a pull lands. Those are load-bearing
 *   for the vendored gousse source (ADR 0003): the `@gousse` namespace is the
 *   published registry, and the aliases are the paths a re-install overwrites in
 *   place. This slice changed the style and nothing else, so they are pinned.
 *
 * Asserted as text because the file is text, and because nothing here renders:
 * a wrong style is invisible until the day someone runs `shadcn add`, and by
 * then the source is already in the tree.
 *
 * Paths are cwd-relative — vitest runs from the package root.
 */

const read = (path: string) => readFileSync(path, "utf8");

type ComponentsJson = {
  style: string;
  aliases: Record<string, string>;
  registries: Record<string, string>;
};

const config = JSON.parse(read("components.json")) as ComponentsJson;
const manifest = JSON.parse(read("package.json")) as {
  dependencies: Record<string, string>;
};

/** The prefix every Base UI variant of the stock registry carries. */
const BASE_UI_FAMILY = "base-";

describe("the declared style", () => {
  it("is the Base UI variant miel uses", () => {
    expect(config.style).toBe("base-nova");
  });

  it("is in the same family as the primitive system mamen installs", () => {
    // The tie is the point: reverting the style while the dependency stays
    // would leave `shadcn add` emitting source for a library this repo does
    // not have, which is how the second primitive system came back.
    expect(config.style.startsWith(BASE_UI_FAMILY)).toBe(true);
    expect(manifest.dependencies).toHaveProperty("@base-ui-components/react");
  });
});

describe("the pull targets", () => {
  it("declares the @gousse namespace and nothing else", () => {
    expect(config.registries).toStrictEqual({
      "@gousse": "https://lucasriondel.github.io/gousse-ui/r/{name}.json",
    });
  });

  it("keeps every alias the vendored source was installed against", () => {
    expect(config.aliases).toStrictEqual({
      components: "@/components",
      utils: "@/lib/utils",
      ui: "@/components/ui",
      lib: "@/lib",
      hooks: "@/hooks",
    });
  });

  it("resolves the ui and utils aliases onto the vendored source itself", () => {
    // The aliases a re-install writes through, checked against where that
    // source actually sits — `shadcn add @gousse/sidebar` overwrites
    // `sidebar.tsx` in place, and every vendored component imports `cn` from
    // the `utils` alias. (`hooks` names no directory yet; the CLI creates one
    // the first time an item needs it, so it is not asserted here.)
    const ui = config.aliases.ui.replace(/^@\//, "src/");
    const utils = config.aliases.utils.replace(/^@\//, "src/");

    expect(existsSync(`${ui}/sidebar.tsx`)).toBe(true);
    expect(existsSync(`${ui}/button.tsx`)).toBe(true);
    expect(existsSync(`${utils}.ts`)).toBe(true);
  });
});

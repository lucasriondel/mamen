import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The oxc toolchain lands **beside** biome, not instead of it (issue #132).
 *
 * `.oxlintrc.json` and `.oxfmtrc.json` exist and are runnable and `bun run lint`
 * is still biome. Issue #135 then reformatted the repo and cleared oxlint's
 * findings; the *verdict* those two tools now return lives in
 * `oxc-clean.test.ts`, and what lives here is the configuration they read.
 *
 * Two configs describing the same repo is exactly the arrangement that rots —
 * one of them gets an exclusion the other never hears about, and the first
 * anyone notices is a `dist/` build lighting up under the tool nobody runs yet.
 * So the assertions here are **derived from `biome.json`** wherever the two
 * configs are supposed to agree: the ignored paths, the two rules this repo
 * turns off, and the label-control list. A hardcoded copy would assert the ox
 * config against itself.
 *
 * What is *not* derived is the formatter style. The two deliberately diverge
 * there — oxfmt takes its own defaults (spaces, width 100) while biome's config
 * still says tabs/80 — so that assertion is the absence of a style, and the
 * divergence is pinned as intended rather than as drift. Since #135 the repo is
 * laid out in oxfmt's style, which is what makes biome's formatter red; the
 * cutover ticket is what removes biome, not this file.
 *
 * This lives under `src/test/` rather than beside a component because its
 * subject is the repo, not a component (same as `ci-workflow.test.ts`). Paths
 * are cwd-relative — vitest runs from the package root — so the repo root is
 * `../../`.
 */

const ROOT = "../..";

const read = (path: string) => readFileSync(`${ROOT}/${path}`, "utf8");

type Manifest = {
  scripts: Record<string, string>;
  devDependencies: Record<string, string>;
};

type Oxlintrc = {
  plugins?: string[];
  categories?: Record<string, string>;
  rules?: Record<string, unknown>;
  ignorePatterns?: string[];
};

type Oxfmtrc = Record<string, unknown> & { ignorePatterns?: string[] };

/**
 * Both rc files are read as **JSONC**, which is what oxlint and oxfmt accept.
 * Every narrowing in `.oxlintrc.json` is required to carry the reason it exists
 * (issue #135), and a reason that cannot be written beside the rule ends up
 * nowhere. Comments are stripped rather than parsed — nothing here asserts on
 * them, only on the values underneath.
 */
const jsonc = (source: string) =>
  JSON.parse(source.replace(/^\s*\/\/.*$/gm, "").replace(/^\s*\/\*[\s\S]*?\*\/\s*$/gm, ""));

const manifest = JSON.parse(read("package.json")) as Manifest;
const biome = JSON.parse(read("biome.json"));
const oxlintrc = jsonc(read(".oxlintrc.json")) as Oxlintrc;
const oxfmtrc = jsonc(read(".oxfmtrc.json")) as Oxfmtrc;

/** The `level` half of `"error"` or `["error", { … }]`. */
const level = (entry: unknown) => (Array.isArray(entry) ? (entry[0] as string) : (entry as string));

/** The options half of `["error", { … }]`, or `{}` when there are none. */
const options = (entry: unknown): Record<string, unknown> =>
  Array.isArray(entry) ? ((entry[1] ?? {}) as Record<string, unknown>) : {};

/**
 * The paths `biome.json` refuses to look at, as bare globs. Biome writes its
 * exclusions as negated entries in `files.includes`; oxlint and oxfmt both take
 * a positive `ignorePatterns` list, so the `!` comes off on the way across.
 *
 * The two `*.config.ts` / `*.config.js` entries are dropped: they are biome's
 * own carve-out for the repo's build configs, and the ticket's ignore list does
 * not carry them over — the new tools are meant to see those files.
 */
const BIOME_ONLY = new Set(["*.config.ts", "*.config.js"]);

const biomeExclusions: string[] = (biome.files?.includes ?? [])
  .filter((entry: string) => entry.startsWith("!"))
  .map((entry: string) => entry.slice(1))
  .filter((glob: string) => !BIOME_ONLY.has(glob));

/**
 * `**\/dist` and `**\/dist/**` name the same tree. Comparing them by hand is
 * how the two lists would be allowed to drift while still reading as equal, so
 * both sides are reduced to the directory they root at before comparing.
 */
const asTree = (glob: string) => glob.replace(/\/\*\*$/, "").replace(/\/$/, "");

const ignoresTree = (patterns: string[] | undefined, glob: string) =>
  (patterns ?? []).some((pattern) => asTree(pattern) === asTree(glob));

/** Source with comments removed — a JSDoc that *mentions* `<select>` is
 * prose, and `year-pager.tsx`'s does. */
const code = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("the toolchains the repo has installed", () => {
  it("has oxlint and oxfmt as root devDependencies", () => {
    expect(manifest.devDependencies).toHaveProperty("oxlint");
    expect(manifest.devDependencies).toHaveProperty("oxfmt");
  });

  it("still has biome, which is the one that gates a build", () => {
    expect(manifest.devDependencies).toHaveProperty("@biomejs/biome");
  });
});

describe("the oxlint config", () => {
  it("exists at the repo root, where oxlint looks for it", () => {
    expect(existsSync(`${ROOT}/.oxlintrc.json`)).toBe(true);
  });

  it("enables the plugins the port names", () => {
    expect(oxlintrc.plugins).toStrictEqual([
      "typescript",
      "unicorn",
      "oxc",
      "react",
      "react-hooks",
      "jsx-a11y",
    ]);
  });

  it("errors on correctness and suspicious", () => {
    expect(oxlintrc.categories).toMatchObject({
      correctness: "error",
      suspicious: "error",
    });
  });

  it("does not ask for React in scope, because the app is on the automatic runtime", () => {
    // Derived: the rule is only safe to switch off while the compiler is
    // emitting `jsx-runtime` calls. Flip the tsconfig back and this reads as
    // the mistake it would then be.
    expect(read("packages/web/tsconfig.app.json")).toMatch(/"jsx":\s*"react-jsx"/);
    expect(level(oxlintrc.rules?.["react/react-in-jsx-scope"])).toBe("off");
  });
});

describe("the two rules this repo has always allowed", () => {
  /** biome rule name -> the oxlint rule that says the same thing. */
  const EQUIVALENTS = {
    noExplicitAny: "typescript/no-explicit-any",
    noNonNullAssertion: "typescript/no-non-null-assertion",
  } as const;

  const biomeRules = biome.linter?.rules ?? {};

  const biomeLevel = (rule: string) =>
    Object.values(biomeRules as Record<string, Record<string, unknown>>)
      .map((group) => group?.[rule])
      .find((entry) => entry !== undefined);

  for (const [biomeRule, oxRule] of Object.entries(EQUIVALENTS)) {
    it(`is off in both configs: ${biomeRule}`, () => {
      // Derived from biome.json rather than restated: the pair has to move
      // together, and the failure mode is the ox side keeping a rule the repo
      // switched off years ago — thousands of findings in a report nobody then
      // reads.
      expect(biomeLevel(biomeRule)).toBe("off");
      expect(level(oxlintrc.rules?.[oxRule])).toBe("off");
    });
  }
});

describe("the narrowings issue #135 added", () => {
  /**
   * The rules whose reason lives in `biome.json` rather than in a comment: the
   * repo already made those calls, and the tests above derive each of them from
   * the biome entry that carries the decision.
   */
  const DERIVED = new Set([
    "react/react-in-jsx-scope",
    "typescript/no-explicit-any",
    "typescript/no-non-null-assertion",
    "jsx-a11y/label-has-associated-control",
  ]);

  it("each carry the comment that says why", () => {
    // The ticket's condition for touching this file at all: a rule may be
    // narrowed when it is wrong about *this* codebase, and the claim has to be
    // written down beside it. An uncommented narrowing reads a year later as a
    // rule someone found inconvenient.
    const lines = read(".oxlintrc.json").split("\n");

    const unexplained: string[] = [];
    for (const rule of Object.keys(oxlintrc.rules ?? {})) {
      if (DERIVED.has(rule)) continue;

      const at = lines.findIndex((line) => line.includes(`"${rule}":`));
      const above = lines[at - 1]?.trim() ?? "";
      if (!above.startsWith("//") && !above.startsWith("*")) {
        unexplained.push(rule);
      }
    }

    expect(unexplained).toStrictEqual([]);
  });

  it("allow `_tag`, because it is Effect's word and not this repo's", () => {
    // Derived from a real one: `Data.TaggedError` writes the field and the
    // error taxonomy reads it, so the rule is asking for a rename no caller
    // here is free to make.
    expect(read("packages/web/src/lib/sdk-error.ts")).toContain("_tag");

    const allowed = (options(oxlintrc.rules?.["no-underscore-dangle"]).allow ?? []) as string[];
    expect(allowed).toContain("_tag");
  });

  it("allow `__BUILD_DATE__`, which is Vite's convention and is declared", () => {
    expect(read("packages/web/src/vite-env.d.ts")).toContain("__BUILD_DATE__");

    const allowed = (options(oxlintrc.rules?.["no-underscore-dangle"]).allow ?? []) as string[];
    expect(allowed).toContain("__BUILD_DATE__");
  });

  it("switch off the ES2023 array rules only while the repo compiles to ES2022", () => {
    // The whole reason those two are off: `toSorted`/`toReversed` are the
    // replacement they name, and neither exists in the declared lib. Raise the
    // target and this reddens — which is the reminder to turn them back on
    // rather than a second decision to make later from memory.
    for (const rule of ["unicorn/no-array-sort", "unicorn/no-array-reverse"]) {
      expect(level(oxlintrc.rules?.[rule]), rule).toBe("off");
    }

    expect(read("tsconfig.base.json")).toMatch(/"target":\s*"ES2022"/);
    expect(read("packages/web/tsconfig.app.json")).toMatch(/"lib":\s*\[\s*"ES2022"/);
  });
});

describe("the label/control rule", () => {
  const rule = oxlintrc.rules?.["jsx-a11y/label-has-associated-control"];
  const controlComponents = (options(rule).controlComponents ?? []) as string[];

  it("is on, and carries a control list", () => {
    expect(level(rule)).toBe("error");
    expect(controlComponents.length).toBeGreaterThan(0);
  });

  it("names every component biome already had to be told about", () => {
    const inputComponents = (biome.linter?.rules?.a11y?.noLabelWithoutControl?.options
      ?.inputComponents ?? []) as string[];

    expect(inputComponents.length).toBeGreaterThan(0);
    for (const component of inputComponents) {
      expect(controlComponents).toContain(component);
    }
  });

  it("names only primitives that really render a native control", () => {
    // The list is a licence to wrap a `<label>` around something, so an entry
    // that renders no control silences a real finding. Each name is checked
    // against the file it comes from.
    const FILES: Record<string, string> = {
      Input: "input.tsx",
      Select: "select.tsx",
      Textarea: "textarea.tsx",
      Checkbox: "checkbox.tsx",
    };

    for (const component of controlComponents) {
      const file = FILES[component];
      expect(file, `${component} has no primitive file`).toBeDefined();

      const source = read(`packages/web/src/components/ui/${file}`);
      expect(source, component).toMatch(/<(input|select|textarea)\b/);
      expect(source, component).toContain(`export function ${component}(`);
    }
  });

  it("covers every ui primitive that renders one", () => {
    // The other direction, and the one that rots: a *new* field primitive that
    // nobody adds here is the next false positive, found by whoever wraps a
    // label around it rather than by this suite. So the set is read off the
    // directory rather than listed.
    //
    // `AccountMultiSelect` renders checkboxes, but inside a popover behind its
    // own trigger — there is no `<label>` a caller could wrap around it, and
    // calling it a control would licence one. It is excused by name, with the
    // reason, rather than by the scan quietly not seeing it.
    const COMPOSITES = new Set(["account-multi-select.tsx"]);
    const DIR = "packages/web/src/components/ui";

    const unlisted: string[] = [];
    for (const file of readdirSync(`${ROOT}/${DIR}`)) {
      if (!file.endsWith(".tsx") || file.includes(".test.")) continue;
      if (COMPOSITES.has(file)) continue;

      const source = code(read(`${DIR}/${file}`));
      if (!/<(input|select|textarea)[\s/>]/.test(source)) continue;

      const exported = [...source.matchAll(/export function (\w+)/g)].map((match) => match[1]);
      if (!exported.some((name) => controlComponents.includes(name))) {
        unlisted.push(`${file} (${exported.join(", ")})`);
      }
    }

    expect(unlisted).toStrictEqual([]);
  });
});

describe("what the ox configs refuse to look at", () => {
  it("is every path biome already excludes, in both of them", () => {
    expect(biomeExclusions.length).toBeGreaterThan(0);

    const missing: string[] = [];
    for (const glob of biomeExclusions) {
      if (!ignoresTree(oxlintrc.ignorePatterns, glob)) {
        missing.push(`.oxlintrc.json -> ${glob}`);
      }
      if (!ignoresTree(oxfmtrc.ignorePatterns, glob)) {
        missing.push(`.oxfmtrc.json -> ${glob}`);
      }
    }

    expect(missing).toStrictEqual([]);
  });

  it("includes the vendored source neither tool owns", () => {
    // Named rather than derived only for the two that would be *silently* wrong
    // to lint: gousse's vendored styles (ADR 0003) and the shadcn sidebar, both
    // of which are upstream source this repo re-pulls.
    for (const patterns of [oxlintrc.ignorePatterns, oxfmtrc.ignorePatterns]) {
      expect(ignoresTree(patterns, "packages/web/src/styles/gousse")).toBe(true);
      expect(ignoresTree(patterns, "packages/web/src/components/ui/sidebar.tsx")).toBe(true);
    }
  });

  it("includes the generated files that are nobody's to fix", () => {
    for (const glob of ["**/*.gen.ts", "**/*.gen.tsx"]) {
      expect(ignoresTree(oxlintrc.ignorePatterns, glob)).toBe(true);
      expect(ignoresTree(oxfmtrc.ignorePatterns, glob)).toBe(true);
    }
  });
});

describe("the formatter style", () => {
  it("is oxfmt's own defaults, so the rc declares none", () => {
    // The ticket's one deliberate divergence: matching biome's tabs/80 here
    // would be a second style to keep in sync for exactly as long as biome
    // lives, and the reformat ticket is what closes the gap. `$schema` is not a
    // style — it is what makes the file editable without the docs open.
    const declared = Object.keys(oxfmtrc).filter((key) => key !== "$schema");

    expect(declared).toStrictEqual(["ignorePatterns"]);
  });

  it("leaves biome's style untouched, since biome is still what formats", () => {
    expect(biome.formatter).toMatchObject({
      indentStyle: "tab",
      lineWidth: 80,
    });
  });
});

describe("the scripts", () => {
  const scripts = manifest.scripts;

  it("still lint and format with biome", () => {
    expect(scripts.lint).toContain("biome");
    expect(scripts["lint:fix"]).toContain("biome");
    expect(scripts.format).toContain("biome");
  });

  it("run each ox tool repo-wide under its own name", () => {
    expect(scripts["lint:ox"]).toContain("oxlint");
    expect(scripts["format:ox:check"]).toContain("oxfmt");
    expect(scripts["format:ox:check"]).toContain("--check");
  });

  it("are documented where a contributor goes looking for the checks", () => {
    const contributing = read("CONTRIBUTING.md");

    expect(contributing).toContain("bun run lint:ox");
    expect(contributing).toContain("bun run format:ox:check");
  });

  it("cannot rewrite a source file", () => {
    // The ticket's hard line: this slice reports, it does not edit. `--fix` or
    // `--write` on either script is how a thousand-file reformat lands in the
    // commit that was only supposed to add a config.
    for (const name of ["lint:ox", "format:ox:check"]) {
      expect(scripts[name]).not.toMatch(/--fix|--write/);
    }
  });
});

describe("CI", () => {
  const workflow = read(".github/workflows/ci.yml");

  it("is unchanged: it runs the biome lint and neither ox script", () => {
    expect(workflow).toContain("bun run lint\n");
    expect(workflow).not.toContain("lint:ox");
    expect(workflow).not.toContain("format:ox");
    expect(workflow).not.toContain("oxlint");
    expect(workflow).not.toContain("oxfmt");
  });
});

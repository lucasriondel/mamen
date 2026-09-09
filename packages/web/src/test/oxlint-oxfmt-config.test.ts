import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * oxlint and oxfmt are the repo's lint and format toolchain, and biome is gone
 * (issue #138).
 *
 * #132 installed the ox tools beside biome, reporting only; #135 reformatted
 * the repo and cleared oxlint's findings. This is the cutover: `bun run lint`,
 * `bun run format` and `bun run format:check` are turbo tasks fanned out over
 * every workspace package, CI gates on lint *and* formatting, and `biome.json`
 * and `@biomejs/biome` are deleted.
 *
 * Deleting biome.json is what most of this file is about. Until now the ox
 * configs were asserted **against biome.json** — the ignored paths, the two
 * rules this repo turns off, the label-control list — because two configs
 * describing one repo is the arrangement that rots, and deriving one from the
 * other is how they were held together. That anchor is gone, so each of those
 * decisions has to be re-homed:
 *
 * - the ignore lists are now held against **each other**, so an exclusion added
 *   to one still cannot go missing from the other;
 * - the two always-allowed rules now carry their reason as a comment in
 *   `.oxlintrc.json`, under the same guard as every other narrowing — biome.json
 *   was where those two reasons lived, and a decision whose only record is a
 *   deleted file is a decision nobody made;
 * - the label-control list keeps the two derivations that read the component
 *   tree, which never needed biome at all.
 *
 * The turbo half is asserted through the scripts rather than through a run:
 * turbo executes a task only in packages that define it, so a package missing
 * `lint` is **silently skipped** — a green run that checked four packages out of
 * five. That is the failure this file exists to catch, so the script set is read
 * off the workspace directory rather than listed.
 *
 * What the per-package tasks cannot reach is the `.ts` outside `packages/`
 * (`.sandcastle/`). `oxc-clean.test.ts` runs both tools over the whole repo and
 * is what covers it; the two files split the subject as config and verdict.
 *
 * This lives under `src/test/` rather than beside a component because its
 * subject is the repo, not a component (same as `ci-workflow.test.ts`). Paths
 * are cwd-relative — vitest runs from the package root — so the repo root is
 * `../../`.
 */

const ROOT = "../..";

const read = (path: string) => readFileSync(`${ROOT}/${path}`, "utf8");

type Manifest = {
  name?: string;
  scripts: Record<string, string>;
  devDependencies?: Record<string, string>;
  dependencies?: Record<string, string>;
};

type Oxlintrc = {
  plugins?: string[];
  categories?: Record<string, string>;
  rules?: Record<string, unknown>;
  ignorePatterns?: string[];
};

type Oxfmtrc = Record<string, unknown> & { ignorePatterns?: string[] };

type TurboConfig = {
  globalDependencies?: string[];
  tasks?: Record<string, { cache?: boolean }>;
};

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
const oxlintrc = jsonc(read(".oxlintrc.json")) as Oxlintrc;
const oxfmtrc = jsonc(read(".oxfmtrc.json")) as Oxfmtrc;
const turbo = jsonc(read("turbo.json")) as TurboConfig;

/**
 * The workspace packages, by directory. Read off disk rather than listed: this
 * repo has five where the shape being adopted had a different set, and a sixth
 * added later has to arrive with the scripts or turbo skips it without saying
 * so.
 */
const WORKSPACES = readdirSync(`${ROOT}/packages`, { withFileTypes: true })
  .filter(
    (entry) => entry.isDirectory() && existsSync(`${ROOT}/packages/${entry.name}/package.json`),
  )
  .map((entry) => entry.name);

const packageManifests: Array<[string, Manifest]> = WORKSPACES.map((dir) => [
  dir,
  JSON.parse(read(`packages/${dir}/package.json`)) as Manifest,
]);

/** The `level` half of `"error"` or `["error", { … }]`. */
const level = (entry: unknown) => (Array.isArray(entry) ? (entry[0] as string) : (entry as string));

/** The options half of `["error", { … }]`, or `{}` when there are none. */
const options = (entry: unknown): Record<string, unknown> =>
  Array.isArray(entry) ? ((entry[1] ?? {}) as Record<string, unknown>) : {};

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

  it("has no second linter or formatter anywhere in the workspace", () => {
    // The point of the cutover: one tool per job. A rival installed in a
    // package rather than at the root is how a repo ends up with two opinions
    // again, and this is the scan that would see it.
    const RIVALS = /biome|eslint|prettier/i;

    const everyManifest: Array<[string, Manifest]> = [
      ["package.json", manifest],
      ...packageManifests.map(
        ([dir, pkg]) => [`packages/${dir}/package.json`, pkg] as [string, Manifest],
      ),
    ];

    const found: string[] = [];
    for (const [where, pkg] of everyManifest) {
      for (const name of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) {
        if (RIVALS.test(name)) found.push(`${where} -> ${name}`);
      }
    }

    expect(found).toStrictEqual([]);
  });
});

describe("the oxlint config", () => {
  it("exists at the repo root, where the packages point their `-c` at", () => {
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
  // These calls predate the ox tools, and `biome.json` was where they were
  // written down. Deleting it takes the record with it, so the rules stay off
  // and the reason moves into `.oxlintrc.json`, where the comment guard below
  // covers them like any other narrowing.
  for (const rule of ["typescript/no-explicit-any", "typescript/no-non-null-assertion"]) {
    it(`is off: ${rule}`, () => {
      expect(level(oxlintrc.rules?.[rule])).toBe("off");
    });
  }
});

describe("every narrowing in the oxlint config", () => {
  /**
   * The two rules whose reason is *derived* by a test above rather than written
   * as a comment: each is checked against the file that makes it true — the
   * tsconfig's JSX mode, and the component tree behind the control list.
   */
  const DERIVED = new Set(["react/react-in-jsx-scope", "jsx-a11y/label-has-associated-control"]);

  it("carries the comment that says why", () => {
    // The condition for touching the config at all: a rule may be narrowed when
    // it is wrong about *this* codebase, and the claim has to be written down
    // beside it. An uncommented narrowing reads a year later as a rule someone
    // found inconvenient.
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

  it("allows `_tag`, because it is Effect's word and not this repo's", () => {
    // Derived from a real one: `Data.TaggedError` writes the field and the
    // error taxonomy reads it, so the rule is asking for a rename no caller
    // here is free to make.
    expect(read("packages/web/src/lib/sdk-error.ts")).toContain("_tag");

    const allowed = (options(oxlintrc.rules?.["no-underscore-dangle"]).allow ?? []) as string[];
    expect(allowed).toContain("_tag");
  });

  it("allows `__BUILD_DATE__`, which is Vite's convention and is declared", () => {
    expect(read("packages/web/src/vite-env.d.ts")).toContain("__BUILD_DATE__");

    const allowed = (options(oxlintrc.rules?.["no-underscore-dangle"]).allow ?? []) as string[];
    expect(allowed).toContain("__BUILD_DATE__");
  });

  it("switches off the ES2023 array rules only while the repo compiles to ES2022", () => {
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
  /**
   * The paths only the formatter excludes, because only the formatter would
   * ever rewrite them: prose. oxlint has no opinion about it; it reads
   * `.ts`/`.tsx`.
   *
   * `docs/design` and the root `design/` used to be here too — standalone HTML
   * mockups oxfmt rewrote thousands of lines of. Issue #151 deleted them rather
   * than publishing them, so the exclusions went with them.
   */
  const FORMATTER_ONLY = new Set(["**/*.md"]);

  it("is one list, kept in both, now that neither is derived from biome", () => {
    // biome.json used to be the anchor both were checked against. With it gone
    // the two rc files hold each other: a path excluded from the linter and not
    // from the formatter is a vendored file the next `oxfmt` rewrites.
    const source = (oxlintrc.ignorePatterns ?? []).filter((glob) => !FORMATTER_ONLY.has(glob));
    expect(source.length).toBeGreaterThan(0);

    const missing = source.filter((glob) => !ignoresTree(oxfmtrc.ignorePatterns, glob));
    expect(missing).toStrictEqual([]);

    const extra = (oxfmtrc.ignorePatterns ?? []).filter(
      (glob) => !FORMATTER_ONLY.has(glob) && !ignoresTree(oxlintrc.ignorePatterns, glob),
    );
    expect(extra).toStrictEqual([]);
  });

  it("includes the vendored source neither tool owns", () => {
    // Named rather than derived only for the two that would be *silently* wrong
    // to touch: gousse's vendored styles (ADR 0003) and the shadcn sidebar,
    // both of which are upstream source this repo re-pulls.
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

  it("no longer excludes the design mockups, because there are none", () => {
    // The inverse of the assertion this replaces. An exclusion for a path that
    // does not exist is the same rot as a link to a deleted file: it tells the
    // next reader the repo has design mockups somewhere, and it silently stops
    // protecting anything the day the directory comes back under another name.
    for (const dir of ["docs/design", "design"]) {
      expect(existsSync(`${ROOT}/${dir}`), dir).toBe(false);
      expect(ignoresTree(oxfmtrc.ignorePatterns, dir), dir).toBe(false);
    }
  });
});

describe("the formatter style", () => {
  it("is oxfmt's own defaults, so the rc declares none", () => {
    // There is no second style left to sync with — the one config that stated
    // tabs/80 is deleted. `$schema` is not a style; it is what makes the file
    // editable without the docs open.
    const declared = Object.keys(oxfmtrc).filter((key) => key !== "$schema");

    expect(declared).toStrictEqual(["ignorePatterns"]);
  });
});

describe("the root scripts", () => {
  const scripts = manifest.scripts;

  it("delegate lint and format to turbo", () => {
    for (const name of ["lint", "format", "format:check"]) {
      expect(scripts, name).toHaveProperty(name);
      expect(scripts[name], name).toContain(`turbo run ${name}`);
    }
  });

  it("keep none of the scripts the cutover replaced", () => {
    // `lint:ox` and `format:ox:check` were the temporary pair that ran the new
    // tools beside biome's; `lint:fix` was biome's own writer.
    for (const name of ["lint:ox", "format:ox:check", "lint:fix"]) {
      expect(scripts, name).not.toHaveProperty(name);
    }
  });

  it("run no lint or format tool directly", () => {
    // A root script that shells out to oxlint itself is a second definition of
    // what the checks are, and the copy that drifts is always the one CI runs.
    for (const [name, command] of Object.entries(scripts)) {
      expect(command, name).not.toMatch(/\box(lint|fmt)\b/);
    }
  });

  it("are documented where a contributor goes looking for the checks", () => {
    const contributing = read("CONTRIBUTING.md");

    expect(contributing).toContain("bun run lint");
    expect(contributing).toContain("bun run format:check");
  });
});

describe("every workspace package", () => {
  it("is one turbo will actually run the tasks in", () => {
    // The silent-skip failure: `turbo run lint` visits only the packages that
    // define a `lint` script, and reports success for a run that checked four
    // packages out of five. Derived from the directory so a new package cannot
    // arrive without them.
    expect(WORKSPACES.length).toBeGreaterThan(0);

    const missing: string[] = [];
    for (const [dir, pkg] of packageManifests) {
      for (const task of ["lint", "format", "format:check"]) {
        if (!pkg.scripts?.[task]) missing.push(`packages/${dir} -> ${task}`);
      }
    }

    expect(missing).toStrictEqual([]);
  });

  it("lints against the one config at the repo root", () => {
    // oxlint reads its rc from the working directory, and the working directory
    // is the package. Without `-c` each package would silently run on oxlint's
    // defaults — every narrowing this repo made, undone, five times over.
    for (const [dir, pkg] of packageManifests) {
      expect(pkg.scripts.lint, dir).toContain("../../.oxlintrc.json");
    }
  });

  it("formats the sources the repo formats, and checks the same set", () => {
    const glob = '"**/*.{ts,tsx}"';

    for (const [dir, pkg] of packageManifests) {
      expect(pkg.scripts.format, dir).toContain(glob);
      expect(pkg.scripts["format:check"], dir).toContain(glob);
      expect(pkg.scripts["format:check"], dir).toContain("--check");
    }
  });

  it("cannot have its check rewrite a file", () => {
    // The gate reports; `format` is the one that writes. A `--write` slipped in
    // here turns a failing CI check into a silent reformat of the contributor's
    // branch.
    for (const [dir, pkg] of packageManifests) {
      expect(pkg.scripts["format:check"], dir).not.toMatch(/--write|--fix/);
      expect(pkg.scripts.lint, dir).not.toMatch(/--write|--fix/);
    }
  });
});

describe("the turbo tasks", () => {
  it("declare one for each of the three checks", () => {
    for (const task of ["lint", "format", "format:check"]) {
      expect(turbo.tasks, task).toHaveProperty(task);
    }
  });

  it("do not cache the two that are about the tree right now", () => {
    // `format` rewrites the tree, so a cache hit would skip the write and
    // report success on files it never touched; `format:check` is a verdict on
    // the working tree, which a replay cannot restate.
    expect(turbo.tasks?.format?.cache).toBe(false);
    expect(turbo.tasks?.["format:check"]?.cache).toBe(false);
  });

  it("invalidate the cache when either rc file changes", () => {
    // The rc files live at the root, outside every package, so turbo cannot see
    // them as task inputs. Without this a rule added to `.oxlintrc.json` replays
    // a cached green `lint` from before the rule existed.
    for (const rc of [".oxlintrc.json", ".oxfmtrc.json"]) {
      expect(turbo.globalDependencies, rc).toContain(rc);
      expect(existsSync(`${ROOT}/${rc}`), rc).toBe(true);
    }
  });
});

describe("CI", () => {
  const workflow = read(".github/workflows/ci.yml");

  it("gates on formatting as well as lint", () => {
    expect(workflow).toContain("bun run lint\n");
    expect(workflow).toContain("bun run format:check\n");
  });

  it("runs the repo's scripts rather than the tools", () => {
    // Everything CI runs is something a contributor can run by the same name.
    for (const tool of ["oxlint", "oxfmt", "turbo"]) {
      expect(workflow, tool).not.toContain(tool);
    }
  });
});

describe("biome", () => {
  it("has no config file left", () => {
    expect(existsSync(`${ROOT}/biome.json`)).toBe(false);
    expect(existsSync(`${ROOT}/biome.jsonc`)).toBe(false);
  });

  it("is named by no tracked file", () => {
    // The last of it is the `biome-ignore` comments scattered through the
    // components: directives to a tool that is no longer installed, which read
    // as live suppressions and suppress nothing. `bun.lock` is excluded because
    // it is generated, and this file because it is the one that names the word.
    const SELF = "packages/web/src/test/oxlint-oxfmt-config.test.ts";
    const SKIP = new Set(["bun.lock", SELF]);

    const tracked = execFileSync("git", ["ls-files", "-z"], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    })
      .split("\0")
      .filter(Boolean)
      .filter((path) => !SKIP.has(path) && !/\.(png|jpe?g|gif|webp|ico|pdf|woff2?|db)$/.test(path));

    const offenders = tracked.filter((path) =>
      /biome/i.test(readFileSync(`${ROOT}/${path}`, "utf8")),
    );

    expect(offenders).toStrictEqual([]);
  });
});

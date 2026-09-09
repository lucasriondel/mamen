import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

/**
 * The repo is formatted by oxfmt and clean under oxlint (issue #135).
 *
 * #132 installed both tools and left them *reporting* — 207 lint findings and
 * 624 unformatted files. This is the contract half: the findings are fixed, the
 * reformat has landed, and what keeps it landed is this file.
 *
 * The check is the tool itself rather than a restatement of it. A test that
 * listed the rules, or counted findings, would pass on the day someone adds a
 * file that breaks a rule the list forgot; running `oxlint` and `oxfmt --check`
 * over the repo is the same question CI asks, asked from inside the suite that
 * already runs.
 *
 * Since the cutover (issue #138) CI asks it directly, through `bun run lint` and
 * `bun run format:check` — but those are turbo tasks, and turbo only visits
 * **workspace packages**. The `.ts` outside `packages/` (`.sandcastle/`, the
 * repo's own agent tooling) is reached by no package task, so this file is what
 * covers it, and it runs the tools from the repo root for exactly that reason.
 * The formatter is given the same `**\/*.{ts,tsx}` glob the packages use, so the
 * two are asking one question over two scopes rather than two questions.
 *
 * Both tools read their own rc file at the repo root, so nothing about the rules
 * or the ignore lists is repeated here — `oxlint-oxfmt-config.test.ts` owns
 * those, and this file owns only the verdict.
 *
 * This lives under `src/test/` rather than beside a component because its
 * subject is the repo, not a component. Paths are cwd-relative — vitest runs
 * from the package root — so the repo root is `../../`.
 */

const ROOT = "../..";

/**
 * The tools' output, whatever their exit status. Both exit non-zero when they
 * find something, which `execFileSync` raises — and the *findings* are what a
 * failure here has to print, so the throw is unwrapped rather than asserted on.
 */
function run(binary: string, ...args: string[]): string {
  try {
    return execFileSync(`node_modules/.bin/${binary}`, args, {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string };
    return `${failure.stdout ?? ""}${failure.stderr ?? ""}`;
  }
}

const lines = (output: string) =>
  output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

describe("oxlint over the whole repo", () => {
  it("reports nothing at all", () => {
    // Every diagnostic line, not a count: the assertion has to *name* what
    // broke, because the next reader of this failure is whoever wrote the code
    // and they should not have to re-run the tool to find out.
    const findings = lines(run("oxlint", ".")).filter((line) =>
      /:\d+:\d+: (error|warning)/.test(line),
    );

    expect(findings).toStrictEqual([]);
  });
});

describe("oxfmt over the whole repo", () => {
  it("would rewrite no file", () => {
    // `--check` prints `<path> (<n>ms)` once per file it would rewrite, around
    // a few lines of narration. Only the file lines are kept — matched by their
    // shape rather than by listing the narration, which is the tool's to change.
    const unformatted = lines(run("oxfmt", "--check", "**/*.{ts,tsx}")).filter((line) =>
      /^\S+ \(\d+m?s\)$/.test(line),
    );

    expect(unformatted).toStrictEqual([]);
  });
});

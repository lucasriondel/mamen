/**
 * The README and the landing page, compared as text (issue #150).
 *
 * The two documents explain the same project to the same stranger, and they
 * drift because a change lands in whichever one the author had open. The
 * highest-cost drift is a **command**: a stale one sends a newcomer to a shell
 * that fails. So the commands are extracted from both documents and diffed,
 * mechanically, by the functions below — read by
 * `bun run landing:reconcile`, which prints the comparison, and by
 * `src/reconcile/commands.test.ts`, which fails on it. One extraction, two
 * readers: the pass a person runs by hand and the pass CI runs are the same
 * comparison, so neither can pass while the other would fail.
 *
 * Everything here is a pure function over text, except the two readers at the
 * bottom that go to disk. Paths resolve from `import.meta.url` rather than from
 * the working directory, because the callers stand in different places — vitest
 * in the package root, the command in the repo root.
 *
 * `.claude/skills/readme-landing-sync/SKILL.md` is the pass these functions
 * mechanise: what must agree, what may differ, and the third case a diff cannot
 * see — both documents agreeing with each other and neither with the code.
 */

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { INSTALL } from "../content/install";

const from = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/** The repository root, from which every path below is named as a reader sees it. */
export const REPO_ROOT = from("../../../../");

/** The documented way to run the pass. */
export const RECONCILE_COMMAND = "bun run landing:reconcile";

/** The pass itself, written down: what must agree, and what may differ. */
export const SKILL = ".claude/skills/readme-landing-sync/SKILL.md";

/**
 * The README heading whose blocks are the install path the landing page
 * restates. Everything the README says after its subsections — demo data, the
 * demo stack, the ports table — is the README's alone.
 */
export const INSTALL_HEADING = "## Running it locally";

/** The README, as a reader of the repository sees it. */
export const readReadme = (): string => readFileSync(`${REPO_ROOT}README.md`, "utf8");

/**
 * Every fenced `sh` block in a markdown document, each as the lines a reader
 * would type.
 *
 * A block is the unit because the blocks are what a reader copies: a line break
 * inside one is them pressing return, which is why nothing here unwraps or
 * normalises whitespace the way a prose comparison has to.
 */
export const shellBlocks = (markdown: string): string[][] =>
  [...markdown.matchAll(/```sh\n([\s\S]*?)```/g)].map((match) =>
    (match[1] as string).trimEnd().split("\n"),
  );

/**
 * The blocks under a heading, up to its first subsection.
 *
 * The subsection is the boundary on purpose: `## Running it locally` is the
 * path the landing page restates, and everything `###` below it — the demo
 * data, the demo stack, the ports — is the README's alone.
 */
export function blocksUnder(markdown: string, heading: string): string[][] {
  const start = markdown.indexOf(heading);
  if (start === -1) throw new Error(`the README has no ${heading}`);

  const next = markdown.indexOf("\n### ", start);
  return shellBlocks(markdown.slice(start, next === -1 ? undefined : next));
}

/** The install path as the README tells it. */
export const readmeInstallBlocks = (markdown: string = readReadme()): string[][] =>
  blocksUnder(markdown, INSTALL_HEADING);

/** The install path as the landing page tells it, step by step and in order. */
export const pageInstallBlocks = (): string[][] => INSTALL.steps.map((step) => [...step.commands]);

/**
 * A block list as one text, blocks separated by a blank line — what a diff
 * reads, and what the command prints.
 *
 * Rendering both sides through the same function is what makes the comparison
 * a comparison: a difference in how the two were extracted would otherwise
 * report as drift between the documents.
 */
export const commandText = (blocks: readonly (readonly string[])[]): string =>
  blocks.map((block) => block.join("\n")).join("\n\n");

/**
 * The words a shell line can start with, in either document.
 *
 * A code span is prose until it reads as an instruction: `packages/api/.env`
 * and `mamen.db` are files a sentence names, and only a span that begins with
 * a program is a line a reader would paste into a terminal.
 */
const PROGRAMS = ["bun", "bunx", "docker", "git", "cp", "openssl", "claude"];

/** A line with the aside a document explains it with taken off. */
const withoutComment = (line: string): string => line.replace(/\s+#\s.*$/, "").trim();

/**
 * Whether a line is something a reader types, rather than something a sentence
 * names. A program with nothing after it is the tool — the README calls the PDF
 * prerequisite the `claude` CLI repeatedly — and a list a person is meant to
 * read all of is worth keeping free of it.
 */
const isCommand = (line: string): boolean =>
  PROGRAMS.some((program) => line.startsWith(`${program} `));

/**
 * Every line a markdown document presents as a command: the fenced blocks, and
 * the code spans that read as a shell line.
 *
 * Both, because both are typed. The README names `bun run demo:shots` and
 * `bun run landing:screenshots` in prose rather than in a block, and a pass
 * that read only the blocks would leave those unchecked — which is where a
 * renamed script hides longest.
 *
 * It is a **set**, in document order: the README names `bun dev` three times,
 * and what the pass compares is which commands a document tells a reader to
 * run, not how often it repeats one.
 */
export const commandLines = (markdown: string): string[] => {
  const fenced = shellBlocks(markdown).flat();
  const spans = [...markdown.matchAll(/`([^`\n]+)`/g)].map((match) => match[1] as string);

  return [...new Set([...fenced, ...spans].map(withoutComment).filter(isCommand))];
};

/** Every command the README tells a reader to run, wherever it says it. */
export const readmeCommandLines = (markdown: string = readReadme()): string[] =>
  commandLines(markdown);

/**
 * Every command the landing page tells a reader to type.
 *
 * It reads the steps rather than the page's prose, and that is the rule as
 * much as the implementation: nothing renders markdown here, so a command in a
 * sentence would reach the reader with its backticks — `src/content/prose.test
 * .ts` bans it, and this extraction is why it can.
 */
export const pageCommandLines = (): string[] =>
  pageInstallBlocks().flat().map(withoutComment).filter(isCommand);

/** A script a document tells a reader to run, and where it would resolve. */
export type Invocation = {
  /** The line as the document spells it. */
  readonly command: string;
  /** The workspace `--filter` names, or `null` for a root script. */
  readonly workspace: string | null;
  /** The script name `package.json` has to carry. */
  readonly script: string;
};

/**
 * Bun's own subcommands, which are not scripts and resolve against nothing in
 * this repo. `bun install` is the install step, not a task.
 */
const BUN_SUBCOMMANDS = new Set([
  "add",
  "audit",
  "build",
  "create",
  "exec",
  "init",
  "install",
  "link",
  "outdated",
  "patch",
  "pm",
  "publish",
  "remove",
  "repl",
  "test",
  "unlink",
  "update",
  "upgrade",
  "why",
  "x",
]);

/**
 * The script invocations among a set of command lines.
 *
 * Anything else — `git clone`, `docker compose up`, `openssl rand` — is a
 * program the machine provides, not a name this repo decides, so there is
 * nothing here to hold it to.
 */
export function scriptInvocations(lines: readonly string[]): Invocation[] {
  const invocations: Invocation[] = [];

  for (const command of lines) {
    const tokens = command.split(/\s+/);
    if (tokens[0] !== "bun") continue;

    let at = 1;
    if (tokens[at] === "run") at++;

    let workspace: string | null = null;
    if (tokens[at] === "--filter") {
      workspace = tokens[at + 1] ?? null;
      at += 2;
    }

    const script = tokens[at];
    // A bare `bun <file>` runs the file; `bun <word>` falls back to a script,
    // which is what lets the README write `bun dev` for `bun run dev`.
    if (script === undefined || script.includes(".") || script.includes("/")) continue;
    if (tokens[1] !== "run" && BUN_SUBCOMMANDS.has(script)) continue;

    invocations.push({ command, workspace, script });
  }

  return invocations;
}

/** Every `package.json` in the repo, by its name, with the scripts it declares. */
export function readManifests(): Map<string, ReadonlySet<string>> {
  const manifests = new Map<string, ReadonlySet<string>>();

  const add = (path: string) => {
    const manifest = JSON.parse(readFileSync(path, "utf8"));
    manifests.set(manifest.name, new Set(Object.keys(manifest.scripts ?? {})));
  };

  add(`${REPO_ROOT}package.json`);
  for (const entry of readdirSync(`${REPO_ROOT}packages`, { withFileTypes: true })) {
    if (entry.isDirectory()) add(`${REPO_ROOT}packages/${entry.name}/package.json`);
  }

  return manifests;
}

/** The root manifest's name, which is what a `bun run` with no filter reaches. */
const ROOT_PACKAGE = "mamen";

/**
 * The invocations that name a script the repo does not have.
 *
 * This is the pass's third case in the only form a machine can see it: the two
 * documents agreeing with each other, and the code having moved out from under
 * both. A reader meets it as a shell that fails.
 */
export const unresolved = (
  invocations: readonly Invocation[],
  manifests: ReadonlyMap<string, ReadonlySet<string>>,
): Invocation[] =>
  invocations.filter(
    (invocation) => !manifests.get(invocation.workspace ?? ROOT_PACKAGE)?.has(invocation.script),
  );

/**
 * A unified line diff of two texts: `-` for a line only on the left, `+` for
 * one only on the right, and nothing at all when they are equal.
 *
 * Deliberately literal, and deliberately not a similarity score. A command that
 * drifted by a flag is a reader typing the wrong thing, which is exactly the
 * failure a "these two look alike" comparison waves through — so the unit is a
 * line, and a line either matches or it does not.
 *
 * Longest common subsequence, so a step *inserted* on one side reports as one
 * added line rather than realigning every line after it into noise.
 */
export function diffLines(left: string, right: string): string[] {
  const a = left.split("\n");
  const b = right.split("\n");

  // lengths[i][j] — the longest common subsequence of a.slice(i) and b.slice(j).
  const lengths: number[][] = Array.from({ length: a.length + 1 }, () =>
    Array.from<number>({ length: b.length + 1 }).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      const row = lengths[i] as number[];
      const next = lengths[i + 1] as number[];
      row[j] =
        a[i] === b[j]
          ? (next[j + 1] as number) + 1
          : Math.max(next[j] as number, row[j + 1] as number);
    }
  }

  const out: string[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
    } else if ((lengths[i + 1]?.[j] ?? 0) >= (lengths[i]?.[j + 1] ?? 0)) {
      out.push(`- ${a[i]}`);
      i++;
    } else {
      out.push(`+ ${b[j]}`);
      j++;
    }
  }
  for (; i < a.length; i++) out.push(`- ${a[i]}`);
  for (; j < b.length; j++) out.push(`+ ${b[j]}`);

  return out;
}

/** What the pass found: the text a reader reads, and whether it may be ignored. */
export type Report = {
  /** False when something below needs a decision, which is the exit code. */
  readonly ok: boolean;
  readonly lines: readonly string[];
};

/**
 * The mechanical half of the pass, as a report
 * (`.claude/skills/readme-landing-sync/SKILL.md`).
 *
 * Three questions, none of which anybody should answer by eye: what each
 * document tells a reader to type, whether the path they share is the same
 * text, and whether either names a script this repo no longer has.
 *
 * It prints rather than merely failing, because the answer to drift is a
 * judgement: the README is the source of truth for facts, so the page is
 * usually the stale one — but when both agree and the diff is empty, the thing
 * that moved is the code, and the reader still has to go and look.
 */
export function reconciliationReport(): Report {
  const readme = readmeCommandLines();
  const page = pageCommandLines();
  const manifests = readManifests();
  const missing = unresolved(scriptInvocations([...readme, ...page]), manifests);
  const drift = diffLines(commandText(readmeInstallBlocks()), commandText(pageInstallBlocks()));

  const lines = [
    `README — every command it tells a reader to run (${readme.length}):`,
    ...readme.map((command) => `  ${command}`),
    "",
    `Landing page — every command it tells a reader to type (${page.length}):`,
    ...page.map((command) => `  ${command}`),
    "",
    `The install path (${INSTALL_HEADING}), README against the page:`,
    ...(drift.length === 0 ? ["  no drift"] : drift.map((line) => `  ${line}`)),
    "",
    "Commands naming a script this repo has:",
    ...(missing.length === 0
      ? ["  all of them"]
      : missing.map(
          (one) => `  ${one.command} — no such script, check the code before either doc`,
        )),
  ];

  return { ok: drift.length === 0 && missing.length === 0, lines };
}

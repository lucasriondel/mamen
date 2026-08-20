import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RECONCILE_COMMAND, REPO_ROOT, SKILL } from "./commands";

/**
 * The pass, as a document somebody can follow (issue #150).
 *
 * The assertions here are the ones that keep a skill from becoming a story
 * about a repo that no longer exists: the command it tells a reader to run has
 * to be a script this repo has, the files it names have to be files, and the
 * rules it states have to be the rules the tests enforce. Same convention as
 * `framework-adr.test.ts`, which holds the ADRs to their citations, and
 * `sync.test.ts`, which holds the capture skill to the command it documents.
 *
 * What no test can hold is the judgement the skill exists to pass on — which
 * document to edit when the two disagree. That is why it is prose at all.
 */

const read = (path: string) => readFileSync(`${REPO_ROOT}${path}`, "utf8");

const skill = read(SKILL);
const manifest = JSON.parse(read("package.json"));

describe("the reconciliation skill", () => {
  it("is a skill: frontmatter, a name matching its directory, and when to use it", () => {
    const frontmatter = skill.match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? "";

    expect(frontmatter).toContain(`name: ${SKILL.split("/").at(-2)}`);
    expect(frontmatter).toMatch(/description: .+/);
    // Every other skill's description says when to reach for it, which is what
    // an agent choosing between them reads.
    expect(frontmatter).toMatch(/Use when/);
  });

  it("is listed where an agent looks for the repo's skills", () => {
    // A skill nobody is pointed at is a file. CLAUDE.md is the entry point,
    // and it names every skill the repo has — read from the directory, so a
    // second one added later is held to the same rule.
    const CLAUDE = read("CLAUDE.md");

    for (const entry of readdirSync(`${REPO_ROOT}.claude/skills`)) {
      expect(CLAUDE, `CLAUDE.md does not point at ${entry}`).toContain(entry);
    }
  });

  it("names a command the repo has, and the test that runs the same comparison", () => {
    expect(skill).toContain(RECONCILE_COMMAND);
    expect(Object.keys(manifest.scripts)).toContain(RECONCILE_COMMAND.replace("bun run ", ""));
    expect(skill).toContain("src/reconcile/commands.test.ts");
  });

  it("says what must agree and what may differ", () => {
    // The scope is half the pass: a document that told an agent to make the
    // two files say the same thing would have it delete the README's stack
    // table, which the landing page has no business restating.
    expect(skill).toMatch(/## What must agree/);
    expect(skill).toMatch(/## What may differ/);
  });

  it("says to check the code first, and names the case where both are stale", () => {
    // The trap: two documents can agree with each other and neither with the
    // code, and a reader who "reconciles" then writes the wrong fact down
    // twice. `src/reconcile/facts.test.ts` is the machine half of it.
    expect(skill).toMatch(/check the code/i);
    expect(skill).toMatch(/both/i);
    expect(skill).toContain("src/reconcile/facts.test.ts");
  });

  it("states the rule that no markdown may be carried into the page's prose", () => {
    // Facts get copied across; prose never does. Nothing renders markdown on
    // the landing page, so a backtick carried over reaches the reader.
    expect(skill).toMatch(/markdown/i);
    expect(skill).toContain("src/content/prose.test.ts");
  });

  it("says which files are generated and must never be hand-edited", () => {
    expect(skill).toContain("src/content/screenshots.gen.ts");
    expect(skill).toContain("public/screenshots/");
    expect(skill).toMatch(/never (?:be )?(?:hand-)?edit/i);
  });

  it("names files that exist", () => {
    // The rot a doc about other files is prone to. Every repo path it names,
    // resolved — the same guard `docs.test.ts` puts on CONTEXT.md.
    const paths = [...skill.matchAll(/`((?:packages|docs|src|public|\.claude)\/[\w./-]+)`/g)].map(
      (match) => match[1] as string,
    );
    expect(paths.length).toBeGreaterThan(5);

    for (const path of paths) {
      // A path relative to the landing package, or one from the repo root:
      // the skill writes each as its reader would type it.
      const candidates = [`${REPO_ROOT}${path}`, `${REPO_ROOT}packages/landing-page/${path}`];
      expect(candidates.some(existsSync), `the skill names ${path}`).toBe(true);
    }
  });
});

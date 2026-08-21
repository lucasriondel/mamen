import { describe, expect, it } from "vitest";
import { INSTALL } from "../content/install";
import {
  blocksUnder,
  commandLines,
  commandText,
  diffLines,
  INSTALL_HEADING,
  pageCommandLines,
  pageInstallBlocks,
  readManifests,
  readmeCommandLines,
  readmeInstallBlocks,
  readReadme,
  reconciliationReport,
  scriptInvocations,
  unresolved,
} from "./commands";

/**
 * The reconciliation pass, as functions (issue #150).
 */

describe("diffing two command sets as text", () => {
  it("reports nothing when they are the same text", () => {
    expect(diffLines("bun install\nbun dev", "bun install\nbun dev")).toStrictEqual([]);
  });

  it("names both sides of a command that drifted by a flag", () => {
    // The failure the whole pass exists for: one document telling a reader to
    // type something the other does not. Both lines are reported, because
    // which of the two is right is a question about the code.
    expect(diffLines("bun install", "bun install --frozen-lockfile")).toStrictEqual([
      "- bun install",
      "+ bun install --frozen-lockfile",
    ]);
  });

  it("reports an inserted step as one line, not as everything after it", () => {
    // Longest common subsequence rather than a line-by-line walk: a step added
    // to one document must not realign the rest into noise nobody reads.
    expect(diffLines("a\nc", "a\nb\nc")).toStrictEqual(["+ b"]);
  });
});

describe("the install path both documents carry", () => {
  it("is the same commands, in the same order, spelled the same way", () => {
    // The reconciliation itself. `landing:reconcile` prints this diff and this
    // asserts it is empty — the same extraction on both sides, so the pass a
    // person runs by hand cannot disagree with the one CI runs.
    expect(
      diffLines(commandText(readmeInstallBlocks()), commandText(pageInstallBlocks())),
    ).toStrictEqual([]);
  });

  it("is read from the README section a reader follows, not from the whole file", () => {
    // Everything under the section's subsections — demo data, the demo stack,
    // the ports table — is the README's alone, and the page has no business
    // restating it.
    expect(readmeInstallBlocks()).toStrictEqual(blocksUnder(readReadme(), INSTALL_HEADING));
    expect(readmeInstallBlocks().length).toBe(INSTALL.steps.length);
    expect(readmeInstallBlocks()[0]?.[0]).toMatch(/^git clone /);
  });
});

describe("the commands a document presents as commands", () => {
  it("are the fenced blocks and the code spans that read as a shell line", () => {
    // A command mentioned in a sentence is still a command a reader types —
    // the README names `bun run demo:shots` in prose — so a pass that only
    // read the fenced blocks would leave half of them unchecked.
    const markdown = [
      "```sh",
      "bun run typecheck",
      "```",
      "",
      "Then run `bun run lint` twice.",
    ].join("\n");

    expect(commandLines(markdown)).toStrictEqual(["bun run typecheck", "bun run lint"]);
  });

  it("keep prose out: a code span naming a file or a value is not a command", () => {
    expect(commandLines("`packages/api/.env`, `DB_PATH=demo.db` and `mamen.db`")).toStrictEqual([]);
  });

  it("keep prose out: a bare program name is the tool, not a line to type", () => {
    // The README calls the PDF prerequisite the `claude` CLI half a dozen
    // times. That is the program being named, and reporting it as a command
    // is noise in a list whose whole value is that a person reads all of it.
    expect(commandLines("the `claude` CLI, set up with `claude setup-token`")).toStrictEqual([
      "claude setup-token",
    ]);
  });

  it("report a command once, however many times a document names it", () => {
    expect(commandLines("`bun dev` … `bun dev` again")).toStrictEqual(["bun dev"]);
  });

  it("drop the comment a README block explains itself with", () => {
    // `bun run demo:up      # http://localhost:5400/app/` is one command and
    // one aside; the aside is prose that happens to sit after a hash.
    expect(commandLines("```sh\nbun run demo:up      # serves the app\n```")).toStrictEqual([
      "bun run demo:up",
    ]);
  });
});

describe("resolving a command against the repo", () => {
  it("reads the script out of every form the documents use", () => {
    expect(
      scriptInvocations([
        "bun run typecheck",
        "bun run --filter @mamen/api emit-openapi",
        "bun run seed:demo packages/api/demo.db",
        "bun dev",
        "bun install",
        "docker compose up --build",
      ]),
    ).toStrictEqual([
      { command: "bun run typecheck", workspace: null, script: "typecheck" },
      {
        command: "bun run --filter @mamen/api emit-openapi",
        workspace: "@mamen/api",
        script: "emit-openapi",
      },
      { command: "bun run seed:demo packages/api/demo.db", workspace: null, script: "seed:demo" },
      // `bun dev` is `bun run dev` — Bun falls back to a script for a word it
      // has no subcommand for, which is why the README can write it that way.
      { command: "bun dev", workspace: null, script: "dev" },
    ]);
  });

  it("says which invocation names a script the repo does not have", () => {
    // The pass's third case, mechanised: the two documents can agree with each
    // other and neither with the code. A renamed or deleted script is that
    // case in the form a reader hits first — a shell that fails.
    const manifests = readManifests();

    expect(unresolved(scriptInvocations(["bun run typecheck"]), manifests)).toStrictEqual([]);
    expect(
      unresolved(
        scriptInvocations(["bun run typechek", "bun run --filter @mamen/web seed:demo"]),
        manifests,
      ),
    ).toStrictEqual([
      { command: "bun run typechek", workspace: null, script: "typechek" },
      {
        command: "bun run --filter @mamen/web seed:demo",
        workspace: "@mamen/web",
        script: "seed:demo",
      },
    ]);
  });

  it("finds the root and every workspace, so a missing manifest is not a pass", () => {
    const manifests = readManifests();

    expect([...manifests.keys()].sort()).toStrictEqual([
      "@mamen/api",
      "@mamen/landing-page",
      "@mamen/sdk",
      "@mamen/shared",
      "@mamen/web",
      "mamen",
    ]);
  });
});

describe("every command either document tells a reader to run", () => {
  it("names a script the repo still has", () => {
    // Run today, this is what a hand pass would have had to check by typing
    // each one. Left as an assertion, it is what fails the day a script is
    // renamed under two documents that both still say the old name.
    const manifests = readManifests();

    expect(unresolved(scriptInvocations(readmeCommandLines()), manifests)).toStrictEqual([]);
    expect(unresolved(scriptInvocations(pageCommandLines()), manifests)).toStrictEqual([]);
  });

  it("is checked against something, rather than against an empty extraction", () => {
    // A rename that broke the extraction would otherwise turn the assertion
    // above into a loop over nothing.
    expect(scriptInvocations(readmeCommandLines()).length).toBeGreaterThan(8);
    expect(scriptInvocations(pageCommandLines()).length).toBeGreaterThan(0);
  });

  it("is reported by the command the skill tells a reader to run", () => {
    // What `bun run landing:reconcile` prints: both command sets, the diff of
    // the path they share, and what neither document's commands resolve to.
    // Green today, which is the acceptance criterion — and it is the report
    // rather than a bare exit code because the person running the pass has to
    // decide *which* document is the stale one.
    const report = reconciliationReport();

    expect(report.ok).toBe(true);
    expect(report.lines.join("\n")).toContain("bun run landing:screenshots");
    expect(report.lines.join("\n")).toMatch(/no drift/i);
  });

  it("is one the README also carries, when the landing page carries it", () => {
    // The direction that matters: the README is the source of truth for
    // facts, and the page may say less but never something else.
    const readme = new Set(readmeCommandLines());

    for (const command of pageCommandLines()) {
      expect(readme, `the README does not carry: ${command}`).toContain(command);
    }
  });
});

import { reconciliationReport } from "./commands";

/**
 * `bun run landing:reconcile` — the mechanical half of the README and
 * landing-page reconciliation pass (issue #150).
 *
 * It extracts the commands from both documents, diffs the path they share as
 * text, and checks that every script either of them names still exists. What it
 * finds is printed in full, whether or not anything is wrong: the pass is a
 * thing a person does, and the report is what they read before deciding which
 * document to edit.
 *
 * It exits non-zero on drift so it can be run as a check, but the exit code is
 * the least of it — `src/reconcile/commands.test.ts` already fails the same
 * way in CI. The reason to run this by hand is the part no test prints: the
 * *content* of both command sets, side by side, for the surfaces a diff cannot
 * reach.
 *
 * The rest of the pass — the prerequisites, the environment facts, the images,
 * and the rule that no markdown may be carried into the page's prose — is in
 * `.claude/skills/readme-landing-sync/SKILL.md`, with the test that holds each.
 */

const report = reconciliationReport();

console.log(report.lines.join("\n"));

if (!report.ok) {
  console.error(
    "\nThe two documents disagree. Check the code first: when both are stale, " +
      "editing either one to match the other writes the wrong fact down twice.",
  );
  process.exit(1);
}

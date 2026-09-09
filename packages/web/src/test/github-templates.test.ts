import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

/**
 * What a visitor is handed when they open a pull request or file an issue
 * (issue #112).
 *
 * These files are the repo's half of a conversation with someone who has never
 * seen it: the PR template asks for the three things a reviewer cannot infer
 * from a diff, and the issue forms ask a reporter for what a triager would
 * otherwise have to go back and request. The failure they exist to prevent is
 * silent — nothing breaks when a template stops asking for reproduction steps,
 * it just costs a round trip per issue, forever.
 *
 * The label is the load-bearing part. `docs/agents/triage-labels.md` is where
 * this repo maps triage *roles* to the label strings its tracker actually uses,
 * and the `/triage` skills read it; a template that hard-codes a string is a
 * second vocabulary, and an issue labelled from the wrong one lands outside the
 * flow entirely. So the expected label is read out of that table rather than
 * written here, and *every* form is held to it — including ones added later.
 *
 * Note the label must also exist in the tracker: GitHub drops labels an issue
 * form names but the repo does not define. That half cannot be asserted from a
 * test run (it is a call to the API, not a file), so it is recorded here
 * instead: `needs-triage` was created on the repo for this issue.
 *
 * This lives under `src/test/` rather than beside a component because it has no
 * component subject — its subject is the repo. Paths are cwd-relative (vitest
 * runs from the package root), so the root is `../../`.
 */

const ROOT = "../..";
const GITHUB = `${ROOT}/.github`;
const FORMS = `${GITHUB}/ISSUE_TEMPLATE`;
const PR_TEMPLATE = `${GITHUB}/pull_request_template.md`;

type Field = {
  type?: string;
  id?: string;
  attributes?: { label?: string; description?: string };
  validations?: { required?: boolean };
};

type IssueForm = {
  name?: string;
  description?: string;
  labels?: string[];
  body?: Field[];
};

const form = (file: string): IssueForm => parse(readFileSync(`${FORMS}/${file}`, "utf8"));

/** Every issue form, by filename — `config.yml` is settings, not a form. */
const formFiles = () =>
  readdirSync(FORMS).filter((file) => file.endsWith(".yml") && file !== "config.yml");

/**
 * The label string this repo's tracker uses for the `needs-triage` role, read
 * out of the mapping table the triage skills read. The table's left column is
 * the canonical role and the right column is the local string, so a repo that
 * renames its vocabulary renames it here and the forms follow.
 */
function triageLabel(): string {
  const doc = readFileSync(`${ROOT}/docs/agents/triage-labels.md`, "utf8");

  const row = doc
    .split("\n")
    .map((line) => line.split("|").map((cell) => cell.trim().replace(/`/g, "")))
    .find((cells) => cells[1] === "needs-triage");

  expect(row, "no needs-triage row in docs/agents/triage-labels.md").toBeDefined();
  return (row as string[])[2];
}

/** A form's field with this id, whatever its wording. */
const field = (template: IssueForm, id: string) =>
  (template.body ?? []).find((entry) => entry.id === id);

describe("the pull request template", () => {
  it("exists where GitHub looks for it", () => {
    expect(existsSync(PR_TEMPLATE)).toBe(true);
  });

  it("asks what changed, why, and how it was verified", () => {
    const headings = readFileSync(PR_TEMPLATE, "utf8")
      .split("\n")
      .filter((line) => line.startsWith("#"))
      .map((line) => line.toLowerCase());

    const asks = (word: string) => headings.some((heading) => heading.includes(word));

    expect(asks("what")).toBe(true);
    expect(asks("why")).toBe(true);
    expect(asks("verif")).toBe(true);
  });
});

describe("the issue forms", () => {
  it("cover a bug report and a feature request", () => {
    expect(formFiles().sort()).toStrictEqual(["bug_report.yml", "feature_request.yml"]);
  });

  it("each carry a name and a description, which is what the chooser shows", () => {
    for (const file of formFiles()) {
      const template = form(file);

      expect(template.name, file).toBeTruthy();
      expect(template.description, file).toBeTruthy();
    }
  });

  it("each land a new issue in the triage flow", () => {
    for (const file of formFiles()) {
      expect(form(file).labels, file).toContain(triageLabel());
    }
  });
});

describe("the bug report form", () => {
  const bug = () => form("bug_report.yml");

  it("requires what happened, what was expected, and the steps", () => {
    for (const id of ["what-happened", "expected", "steps"]) {
      const entry = field(bug(), id);

      expect(entry, id).toBeDefined();
      expect(entry?.validations?.required, id).toBe(true);
    }
  });

  it("gives the reporter room to write, not a single line", () => {
    // A one-line input for reproduction steps is a way of asking for less.
    expect(field(bug(), "steps")?.type).toBe("textarea");
  });
});

describe("the feature request form", () => {
  const feature = () => form("feature_request.yml");

  it("asks for the problem before the solution", () => {
    const problem = field(feature(), "problem");

    expect(problem).toBeDefined();
    expect(problem?.validations?.required).toBe(true);
  });
});

describe("the issue template config", () => {
  const config = () =>
    parse(readFileSync(`${FORMS}/config.yml`, "utf8")) as {
      blank_issues_enabled?: boolean;
    };

  it("exists, so the chooser is configured rather than defaulted", () => {
    expect(existsSync(`${FORMS}/config.yml`)).toBe(true);
  });

  it("turns off blank issues, which would arrive unlabelled", () => {
    // The forms are the only thing applying `needs-triage`; a blank issue
    // bypasses them and lands outside the flow the labels exist for.
    expect(config().blank_issues_enabled).toBe(false);
  });
});

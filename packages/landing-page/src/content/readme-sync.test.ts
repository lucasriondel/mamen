import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CONTRIBUTING } from "./contributing";
import { INSTALL } from "./install";
import { SITE } from "./site";

/**
 * The content modules, held to the README (issue #147).
 *
 * The landing page and the README tell a stranger the same story, and the one
 * that goes stale is the landing page: nobody re-reads it while changing a
 * port or an install step. So the words live as **data** (`src/content/`) and
 * this suite reconciles the facts in them against the file the maintainer does
 * keep current — the commands to type, in the order to type them, the
 * prerequisites, the ports, and the one environment variable with no default.
 *
 * The comparison is deliberately literal. A step whose command drifted by a
 * flag is a reader typing the wrong thing, which is exactly the failure a
 * "these two documents look similar" test would wave through.
 *
 * Paths are cwd-relative — vitest runs from the package root.
 */

const read = (path: string) => readFileSync(path, "utf8");

const README = read("../../README.md");

/**
 * A document with its line wrapping taken out, for comparing *prose*: both
 * files are hard-wrapped at eighty columns, so a sentence they share is one
 * line here and two there. Commands are never compared this way — they live in
 * fenced blocks, where a line break is the reader pressing return.
 */
const flat = (text: string) => text.replace(/\s+/g, " ");

const README_PROSE = flat(README);
const CONTRIBUTING_PROSE = flat(read("../../CONTRIBUTING.md"));

/**
 * The fenced blocks under a README heading, up to its first subsection — each
 * as the lines a reader would type.
 */
const blocksUnder = (heading: string): string[][] => {
  const from = README.indexOf(heading);
  expect(from, `README has no ${heading}`).toBeGreaterThan(-1);
  const next = README.indexOf("\n### ", from);
  const section = README.slice(from, next === -1 ? undefined : next);

  return [...section.matchAll(/```sh\n([\s\S]*?)```/g)].map((match) =>
    (match[1] as string).trimEnd().split("\n"),
  );
};

describe("the install guide", () => {
  it("lists the README's install path, step for step and in order", () => {
    // Not "contains the same commands somewhere": the order is the
    // instruction. Installing before cloning is not a step out of place, it
    // is a shell error.
    expect(INSTALL.steps.map((step) => [...step.commands])).toStrictEqual(
      blocksUnder("## Running it locally"),
    );
  });

  it("spells every command exactly as the README does", () => {
    // Redundant with the block comparison today, and deliberately kept: the
    // failure it names — a command a reader would type differing between the
    // two documents — is the one worth reporting on its own terms.
    for (const step of INSTALL.steps) {
      for (const command of step.commands) {
        expect(README).toContain(command);
      }
    }
  });

  it("clones the repository the site links at", () => {
    const clone = INSTALL.steps.flatMap((step) => step.commands).find((c) => c.startsWith("git "));
    expect(clone).toBe(`git clone ${SITE.repositoryUrl}.git`);
  });
});

describe("the prerequisites", () => {
  it("are the ones the README asks for, at the version it pins", () => {
    expect(INSTALL.prerequisites.length).toBeGreaterThan(0);
    for (const prerequisite of INSTALL.prerequisites) {
      expect(README).toContain(prerequisite.url);
      if (prerequisite.version !== undefined) {
        expect(README).toContain(`bun@${prerequisite.version}`);
      }
    }
  });

  it("keep the optional one optional", () => {
    // The `claude` CLI is needed by PDF import alone; a page that presents it
    // as required turns a reader away from an app that would have run.
    const optional = INSTALL.prerequisites.filter((p) => !p.required);
    expect(optional.map((p) => p.name)).toStrictEqual(["The claude CLI"]);
    expect(README_PROSE).toContain("for PDF import, the");
  });
});

describe("the dev servers", () => {
  it("answer on the URLs the README publishes", () => {
    // The numbers come from `@mamen/shared/ports`, which the Vite configs
    // bind, so this reconciles the README against the ports registry too.
    expect(INSTALL.servers.length).toBe(3);
    for (const server of INSTALL.servers) {
      expect(README).toContain(server.url);
    }
  });
});

describe("the environment", () => {
  it("names the variable the README says has no default", () => {
    expect(INSTALL.environment.map((v) => v.variable)).toStrictEqual(["TOKEN_ENCRYPTION_KEY"]);
    for (const variable of INSTALL.environment) {
      // The README's optional-configuration table is where an operator reads
      // the default; `*(unset)*` in that row is the fact this page repeats.
      expect(README).toMatch(new RegExp(`\\| \`${variable.variable}\` \\| \\*\\(unset\\)\\*`));
    }
  });
});

describe("the contributing section", () => {
  it("promises what CONTRIBUTING.md promises, which is nothing", () => {
    expect(CONTRIBUTING_PROSE).toContain("no roadmap, no release cadence, no support promise");
    expect(flat(CONTRIBUTING.body.join(" "))).toContain(
      "no roadmap, no release cadence and no support promise",
    );
  });

  it("links the guide that says the rest", () => {
    expect(CONTRIBUTING.link.href).toBe(`${SITE.repositoryUrl}/blob/main/CONTRIBUTING.md`);
  });
});

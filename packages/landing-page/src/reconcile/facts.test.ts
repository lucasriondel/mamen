import { readFileSync } from "node:fs";
import {
  API_PORTLESS_HOST,
  LANDING_PAGE_PORTLESS_HOST,
  WEB_PORTLESS_HOST,
  WEB_PORTLESS_ORIGIN,
} from "@mamen/shared/ports";
import { describe, expect, it } from "vitest";
import { INSTALL } from "../content/install";
import { REPO_ROOT } from "./commands";

/**
 * The facts both documents state, held against the code that decides them
 * (issue #150).
 *
 * `readme-sync.test.ts` compares the landing page to the README. This is the
 * case that comparison cannot see: the two documents agreeing with each other
 * and the **code** having moved out from under both. A pinned version, a
 * variable's default and a prerequisite are each a fact some file in this repo
 * decides, so each is read from that file rather than from either document.
 *
 * Nothing here imports across packages — `packaging.test.ts` holds this package
 * to two subpaths of `@mamen/shared`, and a test is not an exception to that.
 * The API's config and the AI catalogue are **read as text**, the way
 * `styles.test.ts` reads the app's stylesheets: a comparison of what two files
 * say, not a dependency.
 */

const read = (path: string) => readFileSync(`${REPO_ROOT}${path}`, "utf8");

const README = read("README.md");
const MANIFEST = JSON.parse(read("package.json"));
const API_CONFIG = read("packages/api/src/config.ts");
const AI_CONTRACT = read("packages/shared/src/contract/ai.ts");

/** A README table row, by the variable in its first cell. */
const tableRow = (variable: string): string =>
  README.split("\n").find((line) => line.startsWith(`| \`${variable}\` |`)) ?? "";

/** What the code says about one variable an operator can set. */
type ApiSetting = {
  /** Whether the API falls back to something when it is unset. */
  readonly defaulted: boolean;
  /** That fallback, when it is written out — `null` when it is a constant. */
  readonly fallback: string | null;
};

/**
 * Every environment variable the API reads, and what it falls back to.
 *
 * Read by declaration rather than by a single pattern over the file: what makes
 * a variable defaulted is a `withDefault` in its own pipe, and a `Config.option`
 * three lines below must not inherit it.
 *
 * A fallback that is a constant rather than a literal — the ports come from the
 * registry — is a default the README still has to show, but its *value* is
 * `@mamen/shared/ports`' business and `ports.test.ts` holds the table to it.
 */
const apiEnvironment = (): Map<string, ApiSetting> => {
  const entries = new Map<string, ApiSetting>();

  for (const declaration of API_CONFIG.split("\nexport const ").slice(1)) {
    const variable = declaration.match(/Config\.\w+\("([A-Z_]+)"\)/)?.[1];
    if (variable === undefined) continue;
    entries.set(variable, {
      defaulted: declaration.includes("withDefault("),
      fallback: declaration.match(/withDefault\("([^"]*)"\)/)?.[1] ?? null,
    });
  }

  return entries;
};

describe("the version the documents pin", () => {
  it("is the one the repo pins, not one they remember", () => {
    const pinned = INSTALL.prerequisites.find((prerequisite) => prerequisite.version !== undefined);

    expect(MANIFEST.packageManager).toBe(`bun@${pinned?.version}`);
    expect(README).toContain(`bun@${pinned?.version}`);
  });
});

describe("the environment the documents describe", () => {
  it("is every variable the API reads, and no variable it does not", () => {
    // The README's optional-configuration table is the operator's list. A
    // variable added to `config.ts` and left out of it is a setting nobody
    // can discover; a row for one the code stopped reading is a setting that
    // silently does nothing.
    const variables = [...apiEnvironment().keys()];

    expect(variables.length).toBeGreaterThan(3);
    for (const variable of variables) {
      expect(tableRow(variable), `no README row for ${variable}`).not.toBe("");
    }

    const rows = [...README.matchAll(/^\| `([A-Z_]+)` \|/gm)].map((match) => match[1] as string);
    expect(rows.sort()).toStrictEqual([...variables].sort());
  });

  it("says a variable has no default only where the code gives it none", () => {
    // `*(unset)*` is the fact an operator acts on: it is the difference
    // between a setting they may ignore and one the feature refuses without.
    for (const [variable, setting] of apiEnvironment()) {
      if (!setting.defaulted) {
        expect(tableRow(variable), variable).toContain("| *(unset)* |");
      } else {
        expect(tableRow(variable), variable).not.toContain("*(unset)*");
        if (setting.fallback !== null) {
          expect(tableRow(variable), variable).toContain(`| \`${setting.fallback}\` |`);
        }
      }
    }
  });

  it("puts on the landing page only the ones an operator has to decide", () => {
    // The page carries the install path, not the configuration reference: the
    // one variable it names is the one with no default, and a page listing the
    // rest would be a second copy of the README's table.
    const undecided = [...apiEnvironment()]
      .filter(([, setting]) => !setting.defaulted)
      .map(([variable]) => variable);

    for (const named of INSTALL.environment) {
      expect(undecided, named.variable).toContain(named.variable);
    }
  });
});

describe("the prerequisite the documents ask for", () => {
  it("is the default provider's CLI, which is what the code makes it", () => {
    // The trap this pass exists to name. Both documents used to say the
    // `claude` CLI is what PDF import needs — true when it was the only way to
    // read a statement, and stale since the catalogue grew hosted providers
    // that need no CLI at all. Neither document was wrong about the other; the
    // code had moved under both.
    const providers = (AI_CONTRACT.match(/AiProvider = Schema\.Literal\(([^)]*)\)/)?.[1] ?? "")
      .split(",")
      .map((literal) => literal.trim().replace(/"/g, ""))
      .filter(Boolean);
    const fallback = AI_CONTRACT.match(/DEFAULT_AI_PROVIDER: AiProvider = "([^"]+)"/)?.[1];

    expect(fallback).toBe("claude-code");
    expect(providers.length).toBeGreaterThan(1);
    expect(providers).toContain(fallback);

    // So both documents have to say *default*, rather than presenting the CLI
    // as what PDF import is.
    //
    // The CLI is found by name rather than by being the only optional entry:
    // portless is a second one, and this assertion is about how the CLI is
    // described, not about how many optional prerequisites there are.
    const claudeCli = INSTALL.prerequisites.find(
      (prerequisite) => prerequisite.name === "The claude CLI",
    );
    expect(claudeCli?.required).toBe(false);
    expect(claudeCli?.detail).toMatch(/default provider/);
    expect(README.replace(/\s+/g, " ")).toMatch(/PDF import on its default provider/);
  });
});

describe("the hostnames the documents send a reader to", () => {
  it("are the names the packages register, not the ones the docs remember", () => {
    // The same trap as the CLI, one layer down. `ports.ts` writes the hostnames
    // as literals and both documents import them from there, so the two agree
    // with each other by construction — and neither can see it when a package
    // renames itself. What decides a hostname is that package's own
    // `portless.json`; anything else is a copy.
    //
    // Read as text, like the API's config above: this package is held to two
    // subpaths of `@mamen/shared`, and reaching into another package's config
    // to import it would be the dependency that rule forbids.
    const registered = (path: string): string =>
      JSON.parse(read(`packages/${path}/portless.json`)).name;

    expect(WEB_PORTLESS_HOST).toBe(`${registered("web")}.localhost`);
    expect(API_PORTLESS_HOST).toBe(`${registered("api")}.localhost`);
    expect(LANDING_PAGE_PORTLESS_HOST).toBe(`${registered("landing-page")}.localhost`);
  });

  it("is what the API allows through CORS, so the browser is not refused", () => {
    // The web origin appears twice for one reason: the SPA calls the API from
    // it, and the API has to name it. A rename that moved only the registry
    // would leave every request from the dev server blocked at the browser.
    expect(API_CONFIG).toContain("WEB_PORTLESS_ORIGIN");
    expect(README).toContain(WEB_PORTLESS_ORIGIN);
  });
});

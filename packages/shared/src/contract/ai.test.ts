import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  AI_PROVIDER_LABELS,
  AI_PROVIDER_MODELS,
  AI_PROVIDERS,
  AI_TASKS,
  AiProvider,
  AiTask,
  DEFAULT_AI_PROVIDER,
  defaultModelFor,
  isHostedProvider,
  isModelOfProvider,
} from "./ai";

/**
 * The **AI catalogue** (issue #118, PRD #115) — the vocabulary the web picker,
 * the API's save-time validator and the task table all read.
 *
 * Three of its rules are not enforceable by a type, so they are held here:
 * every provider is complete (label, models, a default), **the first listed
 * model is the default and is the cheap one**, and **model ids are stored
 * bare** — never vendor-prefixed. Plus the property that makes it usable from
 * either side: it is a **leaf**, importing nothing but `effect`.
 */

const source = readFileSync(fileURLToPath(new URL("./ai.ts", import.meta.url)), "utf8");

describe("the provider set", () => {
  it("lists exactly the members of the schema literal", () => {
    expect([...AI_PROVIDERS]).toEqual([...AiProvider.literals]);
  });

  it("puts claude-code first, and makes it the default", () => {
    // A fresh install must never post a bank statement to a vendor the user
    // did not choose, so the local CLI is both the default and what a picker
    // renders at the top.
    expect(DEFAULT_AI_PROVIDER).toBe("claude-code");
    expect(AI_PROVIDERS[0]).toBe("claude-code");
  });

  it("names claude-code as the only local provider", () => {
    const hosted = AI_PROVIDERS.filter(isHostedProvider);
    expect(hosted).toEqual(["anthropic", "google", "openai"]);
    expect(isHostedProvider("claude-code")).toBe(false);
  });

  it("gives every provider a display label", () => {
    expect(Object.keys(AI_PROVIDER_LABELS).sort()).toEqual([...AI_PROVIDERS].sort());
    for (const provider of AI_PROVIDERS) {
      expect(AI_PROVIDER_LABELS[provider].length).toBeGreaterThan(0);
      // A label is what a human reads; an id is what the wire carries.
      expect(AI_PROVIDER_LABELS[provider]).not.toBe(provider);
    }
  });
});

describe("the curated model list", () => {
  it("gives every provider at least one model", () => {
    expect(Object.keys(AI_PROVIDER_MODELS).sort()).toEqual([...AI_PROVIDERS].sort());
    for (const provider of AI_PROVIDERS) {
      expect(AI_PROVIDER_MODELS[provider].length).toBeGreaterThan(0);
    }
  });

  it("makes each provider's first listed model its default", () => {
    for (const provider of AI_PROVIDERS) {
      expect(defaultModelFor(provider)).toBe(AI_PROVIDER_MODELS[provider][0]);
    }
  });

  it("makes that default the cheap model, not the capable one", () => {
    // Spelled out rather than derived: "cheap" is a fact about a vendor's
    // price list, which this module does not hold, so the only way to fail a
    // reorder that lands a user on the priciest model is to name the expected
    // head here. Prices per million input/output tokens at the time of
    // writing: claude-haiku-4-5 $1/$5 vs claude-sonnet-5 $3/$15 and
    // claude-opus-5 $5/$25.
    expect(defaultModelFor("claude-code")).toBe("claude-haiku-4-5");
    expect(defaultModelFor("anthropic")).toBe("claude-haiku-4-5");
    expect(defaultModelFor("google")).toBe("gemini-2.5-flash");
    expect(defaultModelFor("openai")).toBe("gpt-5-mini");
  });

  it("stores model ids bare — never vendor-prefixed", () => {
    for (const provider of AI_PROVIDERS) {
      for (const model of AI_PROVIDER_MODELS[provider]) {
        expect(model).not.toContain("/");
        expect(model).not.toContain(":");
        expect(model.startsWith(`${provider}-`)).toBe(false);
      }
    }
  });

  it("lists each provider's models once", () => {
    for (const provider of AI_PROVIDERS) {
      const models = AI_PROVIDER_MODELS[provider];
      expect(new Set(models).size).toBe(models.length);
    }
  });
});

describe("isModelOfProvider", () => {
  it("accepts a model the provider serves", () => {
    for (const provider of AI_PROVIDERS) {
      for (const model of AI_PROVIDER_MODELS[provider]) {
        expect(isModelOfProvider(provider, model)).toBe(true);
      }
    }
  });

  it("refuses a model the selected vendor does not serve", () => {
    expect(isModelOfProvider("anthropic", "gpt-5-mini")).toBe(false);
    expect(isModelOfProvider("google", "claude-haiku-4-5")).toBe(false);
    expect(isModelOfProvider("openai", "gemini-2.5-flash")).toBe(false);
  });

  it("refuses a vendor-prefixed id, so one cannot round-trip as bare", () => {
    // A provider is named directly, never parsed out of a model id, which is
    // what makes `anthropic/claude-haiku-4-5` a model nobody serves rather
    // than a second spelling of one somebody does.
    expect(isModelOfProvider("anthropic", "anthropic/claude-haiku-4-5")).toBe(false);
    expect(isModelOfProvider("openai", "openai/gpt-5-mini")).toBe(false);
  });
});

describe("the AI task list", () => {
  it("lists exactly the members of the schema literal", () => {
    expect([...AI_TASKS]).toEqual([...AiTask.literals]);
  });

  it("has PDF extraction as its one member", () => {
    expect([...AI_TASKS]).toEqual(["extract-pdf"]);
  });
});

describe("the catalogue is a leaf", () => {
  it("imports nothing but effect", () => {
    // The web picker, the save-time validator and the task table all read it,
    // and none of them should pull a database — or another contract module —
    // in behind it.
    const imports = [...source.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
    expect(imports).toEqual(imports.map(() => "effect"));
  });
});

import { assert, describe, it } from "@effect/vitest";
import {
  AI_PROVIDERS,
  AI_TASKS,
  type AiProvider,
  type AiTask,
  defaultModelFor,
  isHostedProvider,
} from "@mamen/shared/contract";
import {
  type AiTaskChoices,
  applyChange,
  DEFAULT_AI_CHOICE,
  rejectClear,
  rejectPatch,
  rejectTask,
  toSettings,
} from "./kernel";

/**
 * The **save-time kernel** (issue #119, PRD #115) — the one rule of this
 * feature, as a pure function: *a task must never be left pointing at a provider
 * that cannot run it*.
 *
 * It is tested here with no layers and no database, because it has none: given a
 * patch, the current settings and which providers have a credential, it returns
 * a rejection or `null`. That is what makes the **exhaustive** matrix below
 * nearly free — every combination of provider, model validity and credential
 * presence, for both doors — where the same coverage through HTTP would be
 * dozens of round trips.
 */

/** The state a fresh install is in: every task on the default choice. */
const fresh: AiTaskChoices = { "extract-pdf": DEFAULT_AI_CHOICE };

/** No credential stored anywhere. */
const none: ReadonlySet<AiProvider> = new Set();

/** A credential for every provider. */
const all: ReadonlySet<AiProvider> = new Set(AI_PROVIDERS);

/**
 * A second task id, cast in. The catalogue has exactly one task today, but the
 * whole-patch rule is a property of the *patch*, not of the task list — so the
 * multi-task cases are stated here rather than being unwritable until `AI_TASKS`
 * grows, at which point this needs no edit.
 */
const OTHER = "categorise" as AiTask;
const two = (
  first: AiTaskChoices["extract-pdf"],
  second: AiTaskChoices["extract-pdf"],
): AiTaskChoices =>
  // Built from entries rather than as a literal: `AiTask` has one member today,
  // so the two keys read as the same property name to the compiler.
  Object.fromEntries([
    ["extract-pdf", first],
    [OTHER, second],
  ]) as unknown as AiTaskChoices;

describe("the default choice", () => {
  it("is the local CLI on its cheap model", () => {
    // A fresh install runs on the machine it is installed on, and on the
    // cheapest model that machine offers.
    assert.strictEqual(DEFAULT_AI_CHOICE.provider, "claude-code");
    assert.strictEqual(DEFAULT_AI_CHOICE.model, defaultModelFor("claude-code"));
  });
});

describe("resolving a half-edit", () => {
  it("keeps the stored model when only the model is named", () => {
    const current = { provider: "openai" as const, model: "gpt-5" };
    assert.deepStrictEqual(applyChange({ task: "extract-pdf", model: "gpt-5-mini" }, current), {
      provider: "openai",
      model: "gpt-5-mini",
    });
  });

  it("lands on the new provider's default when only the provider is named", () => {
    // Story 18: switching vendor must not silently raise the bill, so the
    // landing spot is the head of the new provider's list, never its priciest
    // model and never a name carried over from the old vendor.
    for (const provider of AI_PROVIDERS.filter((_) => _ !== "openai")) {
      assert.deepStrictEqual(
        applyChange({ task: "extract-pdf", provider }, { provider: "openai", model: "gpt-5" }),
        { provider, model: defaultModelFor(provider) },
      );
    }
  });

  it("keeps the stored model when the named provider is the stored one", () => {
    // Re-saving the same provider is not a switch, so it must not reset a
    // deliberately chosen expensive model back to the cheap default.
    assert.deepStrictEqual(
      applyChange(
        { task: "extract-pdf", provider: "anthropic" },
        { provider: "anthropic", model: "claude-opus-5" },
      ),
      { provider: "anthropic", model: "claude-opus-5" },
    );
  });

  it("takes both halves when both are named", () => {
    assert.deepStrictEqual(
      applyChange(
        { task: "extract-pdf", provider: "google", model: "gemini-2.5-pro" },
        DEFAULT_AI_CHOICE,
      ),
      { provider: "google", model: "gemini-2.5-pro" },
    );
  });

  it("changes nothing when neither half is named", () => {
    const current = { provider: "google" as const, model: "gemini-2.5-pro" };
    assert.deepStrictEqual(applyChange({ task: "extract-pdf" }, current), current);
  });
});

describe("the patch door, over every provider", () => {
  it("accepts a provider's default model when a credential is stored", () => {
    for (const provider of AI_PROVIDERS) {
      assert.isNull(rejectPatch([{ task: "extract-pdf", provider }], fresh, all));
    }
  });

  it("refuses a hosted provider with no credential, and only a hosted one", () => {
    for (const provider of AI_PROVIDERS) {
      const rejection = rejectPatch([{ task: "extract-pdf", provider }], fresh, none);
      if (isHostedProvider(provider)) {
        assert.strictEqual(rejection?.reason, "no-credential");
        assert.strictEqual(rejection?.provider, provider);
        assert.strictEqual(rejection?.task, "extract-pdf");
      } else {
        // claude-code is always runnable at save time: its token is a
        // run-time concern, and checking it here would refuse every save on
        // a fresh install — including the save that switches away from it.
        assert.isNull(rejection);
      }
    }
  });

  it("refuses a model the provider does not serve, credential or not", () => {
    for (const provider of AI_PROVIDERS) {
      for (const configured of [none, all]) {
        const rejection = rejectPatch(
          [{ task: "extract-pdf", provider, model: "gpt-4-turbo" }],
          fresh,
          configured,
        );
        assert.strictEqual(rejection?.reason, "model-not-served");
        assert.strictEqual(rejection?.provider, provider);
      }
    }
  });

  it("checks the model before the credential", () => {
    // Both halves are wrong. The user is told about the model, because an
    // impossible pairing is wrong whether or not a key exists — and sending
    // them to go and store a key would send them to fix the wrong thing.
    const rejection = rejectPatch(
      [{ task: "extract-pdf", provider: "anthropic", model: "gpt-5" }],
      fresh,
      none,
    );
    assert.strictEqual(rejection?.reason, "model-not-served");
  });

  it("refuses a vendor-prefixed spelling of a model it does serve", () => {
    assert.strictEqual(
      rejectPatch(
        [
          {
            task: "extract-pdf",
            provider: "anthropic",
            model: "anthropic/claude-haiku-4-5",
          },
        ],
        fresh,
        all,
      )?.reason,
      "model-not-served",
    );
  });

  it("checks a model-only edit against the provider in the stored row", () => {
    const stored: AiTaskChoices = {
      "extract-pdf": { provider: "google", model: "gemini-2.5-flash" },
    };

    // Served by google — accepted.
    assert.isNull(rejectPatch([{ task: "extract-pdf", model: "gemini-2.5-pro" }], stored, all));
    // Served by somebody, but not by the provider this task is on.
    assert.strictEqual(
      rejectPatch([{ task: "extract-pdf", model: "gpt-5" }], stored, all)?.reason,
      "model-not-served",
    );
  });

  it("refuses a model-only edit on a stored provider whose key is gone", () => {
    // The stored row went bad out of band (the key was cleared before this
    // rule existed). Touching the task is where that is caught.
    const stored: AiTaskChoices = {
      "extract-pdf": { provider: "openai", model: "gpt-5-mini" },
    };
    assert.strictEqual(
      rejectPatch([{ task: "extract-pdf", model: "gpt-5" }], stored, none)?.reason,
      "no-credential",
    );
  });

  it("refuses the whole patch when any one entry is bad", () => {
    const rejection = rejectPatch(
      [
        { task: "extract-pdf", provider: "claude-code" },
        { task: OTHER, provider: "anthropic" },
      ],
      two(DEFAULT_AI_CHOICE, DEFAULT_AI_CHOICE),
      none,
    );

    // The good half is in the patch too; the answer is still a rejection, and
    // it names the half that is wrong.
    assert.strictEqual(rejection?.task, OTHER);
    assert.strictEqual(rejection?.reason, "no-credential");
  });

  it("checks only the tasks the patch touches", () => {
    // A task left pointing at a model that has since left the catalogue must
    // not make every unrelated save fail.
    const stored = two({ provider: "anthropic", model: "claude-2" }, DEFAULT_AI_CHOICE);
    assert.isNull(rejectPatch([{ task: OTHER }], stored, all));
  });

  it("accepts an empty patch", () => {
    assert.isNull(rejectPatch([], fresh, none));
  });
});

describe("resolving one task", () => {
  it("answers null for a task that can run", () => {
    assert.isNull(rejectTask("extract-pdf", fresh, none));
  });

  it("gives the same reason a save of the same choice would have", () => {
    // The resolver and the door are the same question asked at two moments, so
    // they must not be able to disagree: a stored choice that resolves is one
    // the door would have accepted, and vice versa.
    const stored: AiTaskChoices = {
      "extract-pdf": { provider: "openai", model: "gpt-5" },
    };
    assert.strictEqual(rejectTask("extract-pdf", stored, none)?.reason, "no-credential");
    assert.strictEqual(
      rejectPatch([{ task: "extract-pdf", provider: "openai", model: "gpt-5" }], fresh, none)
        ?.reason,
      "no-credential",
    );
  });

  it("refuses a stored model that has left the catalogue", () => {
    const stored: AiTaskChoices = {
      "extract-pdf": { provider: "anthropic", model: "claude-2" },
    };
    const rejection = rejectTask("extract-pdf", stored, all);

    assert.strictEqual(rejection?.reason, "model-not-served");
    assert.strictEqual(rejection?.provider, "anthropic");
  });
});

describe("the settings list", () => {
  it("answers for every task in catalogue order", () => {
    const settings = toSettings(fresh);

    assert.deepStrictEqual(
      settings.map((_) => _.task),
      [...AI_TASKS],
    );
    assert.deepStrictEqual(
      settings.map((_) => [_.provider, _.model]),
      [[DEFAULT_AI_CHOICE.provider, DEFAULT_AI_CHOICE.model]],
    );
  });

  it("carries no credential field", () => {
    // The same rule the resolver's shape carries: a settings row answers
    // *whether and where*, and a key travels only inside the transport that
    // spends it.
    assert.deepStrictEqual(Object.keys(toSettings(fresh)[0] ?? {}).sort(), [
      "model",
      "provider",
      "task",
    ]);
  });
});

describe("the deletion door, over every provider", () => {
  it("refuses to clear the credential a task is running on", () => {
    for (const provider of AI_PROVIDERS.filter(isHostedProvider)) {
      const stored: AiTaskChoices = {
        "extract-pdf": { provider, model: defaultModelFor(provider) },
      };
      const rejection = rejectClear(provider, stored, all);

      assert.strictEqual(rejection?.reason, "credential-in-use");
      assert.strictEqual(rejection?.task, "extract-pdf");
      assert.strictEqual(rejection?.provider, provider);
    }
  });

  it("allows clearing a credential no task is running on", () => {
    const stored: AiTaskChoices = {
      "extract-pdf": { provider: "anthropic", model: "claude-haiku-4-5" },
    };
    for (const provider of AI_PROVIDERS.filter((_) => _ !== "anthropic")) {
      assert.isNull(rejectClear(provider, stored, all));
    }
  });

  it("allows clearing the claude-code credential a task is running on", () => {
    // The two doors have to agree, or the rule is not a rule: a save onto
    // claude-code with no token is accepted, so a state that has one is not one
    // deletion can be refused for. Its token is a run-time concern on both
    // sides of the line.
    assert.isNull(rejectClear("claude-code", fresh, all));
  });

  it("allows clearing a credential a task could not run on anyway", () => {
    // The task is already unrunnable — its model is not one anthropic serves —
    // so the deletion is not what breaks it, and an unrelated key is not held
    // hostage by a row that went bad out of band.
    const stored: AiTaskChoices = {
      "extract-pdf": { provider: "anthropic", model: "claude-2" },
    };
    assert.isNull(rejectClear("anthropic", stored, all));
  });

  it("refuses when any one task is running on it", () => {
    const stored = two(DEFAULT_AI_CHOICE, {
      provider: "openai",
      model: "gpt-5",
    });
    assert.strictEqual(rejectClear("openai", stored, all)?.task, OTHER);
  });

  it("allows clearing a credential that was never stored", () => {
    // Nothing points at it and nothing is there: clearing stays idempotent.
    for (const provider of AI_PROVIDERS) {
      assert.isNull(rejectClear(provider, fresh, none));
    }
  });
});

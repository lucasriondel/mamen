import type { ObjectCodec } from "claude-code-effect";
import { Effect, JSONSchema, ParseResult, Schema } from "effect";

/**
 * The **Effect Schema codec adapter** (issue #121, PRD #115).
 *
 * `ai-task-runner-effect`'s task table states each task's output as an
 * `ObjectCodec` — deliberately validator-agnostic: a JSON Schema for the model,
 * and a decode returning an `Effect` for the answer. Effect Schema supplies both
 * halves already (`JSONSchema.make`, `Schema.decodeUnknown`), so the adapter is
 * this file and **zod does not come back to mamen** — the whole contract is
 * already written in Effect Schema, and restating one class in a second
 * validator would be two definitions of one contract with drift between them as
 * the bug.
 *
 * Only one part of the translation is not mechanical, and it is
 * {@link hoistRootRef}.
 */

/** The `$defs` pointer prefix `JSONSchema.make` emits for a named root. */
const DEFS_PREFIX = "#/$defs/";

/**
 * Inline a bare top-level `{ $ref: "#/$defs/X" }` root, keeping `$defs`.
 *
 * `JSONSchema.make` emits that shape for any identifier-annotated root — which
 * is **every `Schema.Class`**, so every contract class mamen would ever hand a
 * model. The CLI forwards the document into the Anthropic tool `input_schema`,
 * which requires a top-level `type`; without the hoist the run dies as an API
 * 400 (`input_schema.type: Field required`) that nothing on mamen's side names.
 *
 * `claude-code-effect` applies exactly this repair to its own `Schema` branch
 * and deliberately **not** to the codec branch — a JSON Schema another generator
 * built is not that SDK's to rewrite — so it belongs to whoever builds the
 * codec, which is here. `$defs` survives the hoist because the inlined body's
 * own inner `$ref`s still have to resolve.
 *
 * A no-op when the root already carries a `type`.
 */
export const hoistRootRef = (root: JSONSchema.JsonSchema7Root): unknown => {
  const node = root as unknown as Record<string, unknown>;
  const ref = node.$ref;
  if (typeof ref !== "string" || "type" in node) {
    return root;
  }

  const defs = node.$defs as Record<string, unknown> | undefined;
  const body = defs?.[ref.slice(DEFS_PREFIX.length)];
  if (typeof body !== "object" || body === null) {
    return root;
  }

  const { $ref: _hoisted, ...rest } = node;
  return { ...rest, ...(body as Record<string, unknown>) };
};

/**
 * One contract schema as the runner's (and the CLI SDK's) output contract.
 *
 * The decode fails with the **`ArrayFormatter` issues**, not the `ParseError`
 * itself: whatever this returns reaches a caller as `issues` untouched — the
 * SDK's `ClaudeSchemaError.issues` on the CLI branch, `TaskSchemaError.issues`
 * on the hosted one — and it is logged from there. A `ParseError` prints as
 * nothing useful; the formatted array is a list of paths and messages.
 */
export const effectSchemaCodec = <A, I>(schema: Schema.Schema<A, I>): ObjectCodec<A> => ({
  jsonSchema: hoistRootRef(JSONSchema.make(schema)),
  decode: (payload) =>
    Effect.mapError(
      Schema.decodeUnknown(schema)(payload),
      ParseResult.ArrayFormatter.formatErrorSync,
    ),
});

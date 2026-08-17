# Upstream: document parts in `ai-task-runner-effect`

Issue [#123](https://github.com/lucasriondel/mamen/issues/123), the upstream
prerequisite of PRD [#115](https://github.com/lucasriondel/mamen/issues/115).

**Status: written and verified, not published.** The change below is
implemented, typechecked and covered by 17 tests. It is not on npm, because
`ai-task-runner-effect`'s repository has no remote and is not present in the
environment this was written in, and there are no publish credentials here —
the registry lists `0.1.0` and nothing else. The patch beside this file —
`ai-task-runner-effect-0.2.0.patch` — is the artifact to apply in that
repository. mamen's hosted extraction column stays blocked until someone
applies it and publishes `0.2.0`.

## What the patch touches

| File | Change |
| --- | --- |
| `src/prompt.ts` | new — `TaskDocument`, `HostedPrompt`, `HostedPromptBuilt`, `hostedTurn` |
| `src/task.ts` | `TaskSpec.hostedPrompt` widens to return `HostedPromptBuilt` |
| `src/hosted.ts` | `document?` on the seam; `hostedPromptFields` split out and exported; `runHosted` forwards the document |
| `src/runner.ts` | normalizes the builder's return once, through `hostedTurn` |
| `index.ts` | exports the three new types |
| `package.json` | `0.1.0` → `0.2.0` |
| `README.md` | a **Documents** section, and how a fake asserts one |
| `test/support.ts` | new — the codecs, the recording fake, the two `ClaudeCode` layers |
| `test/runner-document.test.ts` | new — the document-bearing path, the text-only path, the CLI branch |
| `test/hosted-prompt-fields.test.ts` | new — the normalizer and the exact ai-sdk shape |
| `test/seam-compatibility.test.ts` | new — a `0.1.0`-shaped fake still compiles and runs |
| `test/ai-sdk-file-part.test.ts` | new — `generateObject` itself, against a stub model |

`packages/api/src/test/upstream-ai-task-runner.test.ts` holds this table to the
patch's own `diff --git` lines, in both directions, and the version and the test
count below to what the patch actually does — so the two files cannot drift.

## Why the change is needed

mamen's `extract-pdf` task has to send a bank statement to a hosted vendor as a
document, because server-side text extraction discards the two-column
Débit/Crédit layout the extraction prompt depends on (PRD #115, *Upstream
prerequisite — hosted PDF input*). Against the published `0.1.0` that is
impossible at three points, all on the hosted path:

| Where | `0.1.0` | Consequence |
| --- | --- | --- |
| `TaskSpec.hostedPrompt` | `(input) => string` | A task can contribute text and nothing else. |
| `HostedGenerate` (the seam) | `system`/`prompt` are `string` | Even if a task could build one, nothing carries it. |
| `generateHostedLive` | calls `generateObject({ prompt })` | The ai-sdk takes attachments only in the `messages:` form. |

So the change runs the width of the hosted path. The CLI path is untouched: it
has tools and a filesystem, so its prompt can name a path and let the CLI's own
`Read` tool open it.

## The change

### 1. A task returns a turn, not just text

`src/prompt.ts` is new and holds the vocabulary:

```ts
export interface TaskDocument {
  readonly data: Uint8Array
  readonly mediaType: string
}

export interface HostedPrompt {
  readonly text: string
  readonly document: TaskDocument
}

export type HostedPromptBuilt = string | HostedPrompt

export const hostedTurn = (built: HostedPromptBuilt) =>
  typeof built === "string" ? { text: built } : built
```

and `TaskSpec.hostedPrompt` widens to `(input: Input) => HostedPromptBuilt`.

**Widen the return rather than add a fourth column.** A `hostedDocument` column
beside `hostedPrompt` would split one decision — what the hosted turn contains —
across two functions taking the same input and required to agree. One builder
returns the whole turn.

**`string` stays a legal return, so no existing table is touched.** A row whose
`hostedPrompt` returns a string is assignable unchanged; the text-only path is
not a migration.

**`data` is a `Uint8Array`, not base64.** One representation means "the right
bytes" is a single unambiguous thing for a test to assert, and the encoding a
vendor wants is the transport's business. It is also what
`fs.readFile`/`Bun.file().bytes()` already hand back, which is how mamen will
read the statement out of ADR 0005's scoped temp dir.

**`mediaType`, not `mimeType`.** It is what the current ai-sdk, and every
vendor's own documentation, calls the field. The pinned SDK's older spelling is
mapped once, in the transport (below).

### 2. The seam carries it

```ts
export type HostedGenerate = (args: {
  readonly vendor: HostedVendor
  readonly modelId: string
  readonly apiKey: string
  readonly system: string
  readonly prompt: string
  readonly document?: TaskDocument   // ← new, optional
  readonly jsonSchema: unknown
}) => Promise<unknown>
```

**Optional, and passed through untranslated.** That is what keeps a fake small,
which is the property #123 insists on and the one seam mamen's spec adopts:

```ts
const generate: HostedGenerate = async (args) => (calls.push(args), payload)
// then
expect(call.document).toEqual({ data: pdfBytes, mediaType: "application/pdf" })
```

A fake written against `0.1.0`'s argument shape still satisfies the type — there
is a test that is exactly that assertion, made by the compiler.

`runHosted` spreads rather than assigns the field
(`...(args.document === undefined ? {} : { document: args.document })`), so a
text-only call has no `document` property at all rather than one holding
`undefined`. An existing fake sees the object it has always seen.

### 3. The live call moves to the message form — only when it must

```ts
export const hostedPromptFields = (args: {…}) =>
  args.document === undefined
    ? { system: args.system, prompt: args.prompt }
    : {
        system: args.system,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: args.prompt },
            { type: "file", data: args.document.data, mimeType: args.document.mediaType },
          ],
        }],
      }
```

**The document rides the user turn**, beside `hostedInstruction` — in this
package the task's `hostedPrompt` is the *system* message and
`hostedInstruction` is the user turn, and a content part exists only in a
message.

**A text-only call keeps the `prompt:` field it always sent.** ai-sdk converts
`prompt:` into the same one-message user turn internally, so unifying would
probably be harmless — but "behaves exactly as before" is a criterion, and the
cheapest way to hold it is to not change the request at all.

**`mimeType` is the pinned SDK's spelling.** `ai@^4.2`'s `FilePart` calls the
IANA type `mimeType`; v5 renamed it `mediaType`. The rename lives in this one
expression. A vendor handed `mediaType` on v4 sees no file and no error, which
is why there is a test asserting the literal key.

**It is split out of `generateHostedLive` and exported so it can be tested.**
Every other hosted test goes through the fake, which means this expression is
the one piece of ai-sdk-shaped code no fake exercises. Typing its return with
`CoreMessage` makes the compiler check the part shape against the installed SDK
rather than a comment doing it.

### 4. The runner normalizes once

```ts
const turn = hostedTurn(spec.hostedPrompt(input))
return yield* runHosted({ …, system: turn.text, document: turn.document, … })
```

The builder is called once — a builder that reads a file should be — and both
forms are one shape past that line.

## What did not change

- **The CLI branch.** Same `cliPrompt`, same `allowedTools`, same
  `claude-code-effect` call and error tags. A document-bearing task run on
  `claude-code` sends its CLI prompt and no document; there is a test.
- **No fallback.** A missing credential is still `TaskNotRunnableError`, and the
  vendor is not called at all.
- **The key is still unwrapped once**, in `runHosted`, at the call that spends
  it, and still scrubbed out of any `HostedApiError` — asserted on the
  document-bearing path too.
- **`TaskSchemaError` vs `HostedApiError`** still split the same way.
- The error taxonomy, the provider vocabulary, `ResolvedProvider`,
  `TaskRunResult` and `makeTaskRunner`'s signature.

## One thing to know when writing mamen's row

`TaskInput` is derived from the **CLI** column
(`Parameters<Table[K]["cliPrompt"]>[0]`), and a row has one `Input`. So both
columns are written against the whole input even where each reads a different
half:

```ts
type Statement = { path: string; bytes: Uint8Array }

"extract-pdf": {
  cliPrompt: (input: Statement) => `…${input.path}…`,      // reads the path
  hostedPrompt: (input: Statement) => ({                    // reads the bytes
    text: EXTRACTION_PROMPT,
    document: { data: input.bytes, mediaType: "application/pdf" },
  }),
}
```

Writing `cliPrompt: (input: { path: string })` and
`hostedPrompt: (input: { path: string; bytes: Uint8Array })` compiles at the
table — `satisfies TaskTable` checks against `TaskSpec<never, unknown>`, and
parameters are contravariant — and then fails at the `run()` call site, where
the error names the CLI column and not the mismatch. This is pre-existing
`0.1.0` behaviour, not something the change introduces, but a document-bearing
task is the first row likely to trip it, since its two columns genuinely read
different halves of the input.

## Verification

Everything below was run against a reconstruction of the package (see *How this
was verified without the repository*).

- **`bun test`: 17 pass, 0 fail** across 4 files:
  - `test/runner-document.test.ts` (7) — a document reaches the seam with the
    right bytes and media type; the hosted turn is still the hosted column and
    the instruction; a missing credential fails without calling the vendor; a
    vendor error quoting the key is scrubbed; a refused payload is a
    `TaskSchemaError`; a text-only task attaches nothing and sends what it
    always sent; the CLI branch sends `cliPrompt` and no document.
  - `test/hosted-prompt-fields.test.ts` (6) — the normalizer, and the exact
    ai-sdk shape in both directions, including the literal `mimeType` key and
    the file part sharing the instruction's turn.
  - `test/seam-compatibility.test.ts` (2) — a fake written against `0.1.0`'s
    signature still runs; asserting a document is one property.
  - `test/ai-sdk-file-part.test.ts` (2) — `generateObject` itself, with a stub
    `LanguageModelV1` that records the prompt the SDK built. Every other hosted
    test stops at the fake, and `hostedPromptFields`' own test asserts the
    literal key against nothing but itself; this one runs the SDK's validation
    and its conversion, so what is asserted is the *provider-facing* file part —
    its media type, and its bytes decoded back out of the SDK's own encoding.
- **Typecheck clean** under `strict` + `exactOptionalPropertyTypes` +
  `noUncheckedIndexedAccess`.
- **Each guard mutation-checked.** Dropping the document from the seam
  forwarding, spelling the ai-sdk field `mediaType`, dropping the document in
  the normalizer, moving the text-only path onto the `messages:` form, sending
  the CLI column to the vendor, and leaking a document into the CLI options each
  redden exactly the assertions that own them, and nothing else. Three of the
  six are also type errors; the `mediaType` one additionally fails inside the
  ai-sdk's own prompt validation, which is the strongest of the six — the SDK
  rejects the request outright rather than quietly sending it with no file.
- **A real consumer**, built from the packed `0.2.0` tarball in a fresh project:
  mamen's intended shape — an Effect Schema codec (`JSONSchema.make` +
  `decodeUnknown`, no zod), an `extract-pdf` row attaching PDF bytes, a
  `HostedGenerate` fake — typechecks under `strict` +
  `exactOptionalPropertyTypes` and runs, with the bytes and media type arriving
  intact and the payload decoding through Effect Schema.

Not verified: **no request was made to a real vendor.** `generateHostedLive`
builds its model handle internally, so there is no seam below it — the stub
model above is spliced in beside it, at `generateObject`, which covers the whole
of the ai-sdk but stops at its provider adapter. So the request is verified as
far as the SDK's provider-facing prompt and no further: what Anthropic, Google
or OpenAI make of a PDF part is not asserted here. Worth one live call with a
small PDF before mamen's hosted column is offered to users.

## How this was verified without the repository

`ai-task-runner-effect` has no remote and its working copy is not in this
environment, so the package was **reconstructed from the published `0.1.0`
tarball**: the compiled `dist/*.js` carries the implementation and every
comment, and `dist/*.d.ts` carries the full type surface. The reconstruction
was then compiled and its output diffed against the published `dist` —
**byte-identical `.js` and `.d.ts`, all seven modules**. That is what makes the
patch trustworthy: it is a diff against source that provably compiles to the
published artifact.

To redo it: unpack the `0.1.0` tarball, write each `src/*.ts` back out of its
`dist` pair, and build with `target: ES2022`, `module: ESNext`,
`moduleResolution: bundler`, `allowImportingTsExtensions`,
`rewriteRelativeImportExtensions`, `verbatimModuleSyntax`, `declaration`, under
`strict` + `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess`. Those
settings are what make the emit byte-comparable; `module: Preserve` is the one
that visibly is not (it drops `export {}` from the type-only `result.js`).

This has now been done **twice, independently** — once when the patch was
written, and once since, from the tarball alone. The second reconstruction
differs from the first only in formatting `tsc` erases, and the patch's hunks
regenerate byte-for-byte identical against it, context lines and all. It applies
to it with `git apply` at zero offset and zero fuzz.

It is still not literally the maintainer's file. Expect the patch to need
`git apply -3` (or a hand application) if the real source differs in whitespace
or comment placement, both of which `tsc` normalizes away. Nothing in the patch
depends on that formatting.

## To land it

1. Apply `ai-task-runner-effect-0.2.0.patch` in the `ai-task-runner-effect`
   working copy (`git apply -3`), reconciling any formatting drift.
2. `bun run typecheck && bun test && bun run build`.
3. Publish `0.2.0` — the version bump is in the patch. It is a **minor**: every
   change is additive and `0.1.0` tables and fakes compile untouched.
4. In mamen: `bun add ai-task-runner-effect@^0.2.0` in `packages/api`, then
   write the `extract-pdf` row's hosted column and make the hosted vendors
   selectable for extraction — the rest of PRD #115.

Note for step 4: PRD #115 also records that `claude-code-effect` is pinned at
`0.1.0` in `packages/api` while this package needs `>=0.2`. That bump is
separate and still owed.

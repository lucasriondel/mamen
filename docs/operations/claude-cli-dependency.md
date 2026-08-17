# Operational dependency: the `claude` CLI

PDF bank-statement import (`POST /import/extract-pdf`) extracts candidate
transactions by handing the file to the **`claude` CLI** through
`claude-code-effect`. That extraction runs on the API server, not the browser —
see [ADR 0005](../adr/0005-pdf-extraction-runs-server-side.md) for *why* it's
server-side and why the credential can't live in the client.

This adds a runtime dependency the rest of the API doesn't have: **the API
process needs the `claude` binary on `PATH`**, plus a **Claude Code token**
stored in the app. This doc records what that means for local dev and for
deploy.

## What the API needs at runtime

- **`claude` on `PATH`** — the CLI binary the extraction spawns. Install it in
  whatever environment runs `@mamen/api` (local shell, deploy container).
- **A Claude Code token stored in Settings** — the OAuth token the CLI
  authenticates with. Since issue #122 it is a **credential pasted in the app**,
  encrypted at rest (ADR 0011) under the `claude-code` provider, and read from
  there **and nowhere else**. There is no environment fallback: a token in the
  API's environment is not read, and setting one does nothing. It is still an
  API-process secret — it reaches the CLI's child process and never the browser.
- **`TOKEN_ENCRYPTION_KEY`** — 64 hex characters (`openssl rand -hex 32`), the
  key that credential is encrypted with. Without it the API still starts and
  every other endpoint works, but no credential can be stored, so PDF import
  cannot be configured at all. See [DEPLOY.md](../../DEPLOY.md).

Nothing else in the app needs the binary or the token — only PDF import.

**Only while extraction runs on `claude-code`.** Since issue #124 the
`extract-pdf` task can be pointed at a hosted vendor (Anthropic, Google, OpenAI)
on the settings page, and that branch spawns nothing: no binary, no Claude Code
token, just that vendor's API key from the same encrypted store. A deployment
that has moved extraction onto a hosted vendor needs neither of the first two
requirements above — `TOKEN_ENCRYPTION_KEY` still applies, because the vendor's
key lives in the same place. `claude-code` remains the default, so a deployment
that has changed nothing still needs both.

## Per-call, not fail-at-build

The token is resolved **when a PDF is uploaded**, not when the server's layers
are built. That is the effect form of `claude-code-effect`'s `ClaudeConfig.token`
(0.2.0), wired in `packages/api/src/ai-runner/claude.ts`.

Practically: **the API boots fine with no token stored.** A missing one breaks
PDF import and nothing else, and it breaks it with a *distinct* error —
`AiProviderNotConfigured` (501), which the web app renders as "no credential
stored" beside a link to the AI settings page, rather than as the opaque
`ExtractionFailed` (502) every other extraction failure collapses to.

This is the reverse of the old behaviour, and worth knowing when reading older
issues: before #122 an unset token failed the layer build and took the whole API
down at startup. A server that won't boot is no longer a sign of a missing token.

Tests never hit this path: they provide `ClaudeCode` through `ClaudeCodeTest`'s
deep-fake executor, so CI needs no real binary and no real token.

## Local dev

1. Install the `claude` CLI so it's on your shell `PATH`.
2. Mint a token: `claude setup-token`.
3. Put a `TOKEN_ENCRYPTION_KEY` in `packages/api/.env` (`openssl rand -hex 32`),
   so the API can encrypt what you're about to paste.
4. Start the app (`bun dev`), open **Settings**, and paste the token into the
   **Claude Code** tile.

The tile then reports the token as stored, with a masked hint — that page is also
the answer to "is my token set?" when import stops working. Rotating it is
pasting a new one: there is no file to edit and no restart, because the token is
read per extraction.

If you're not touching PDF import you can skip all of it. Nothing else in the app
degrades without a token, which is the other half of what changed in #122.

## Deploy (Dokploy)

The deploy environment has the same requirements as local dev:

- The image/runtime that runs `@mamen/api` must have the `claude` CLI installed
  and on `PATH`.
- `TOKEN_ENCRYPTION_KEY` must be set as an environment variable / secret on the
  Dokploy service (alongside `DB_PATH`, `CORS_ORIGINS`, etc. from
  `packages/api/src/config.ts`).
- The Claude Code token is **not** deployment configuration. Paste it in Settings
  on the running app, once, like any other provider credential. It lives in the
  database, so it survives a redeploy and is lost only with the volume — or with
  `TOKEN_ENCRYPTION_KEY`, whose rotation leaves stored credentials unreadable and
  is answered by re-pasting them.

A container that comes up is not evidence that PDF import works — the token is a
per-request concern now. Verify by importing a PDF, or by reading the Claude Code
tile in Settings.

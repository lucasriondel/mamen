# Operational dependency: the `claude` CLI

PDF bank-statement import (`POST /import/extract-pdf`) extracts candidate
transactions by handing the file to the **`claude` CLI** through
`claude-code-effect`. That extraction runs on the API server, not the browser —
see [ADR 0005](../adr/0005-pdf-extraction-runs-server-side.md) for *why* it's
server-side and why the credential can't live in the client.

This adds a runtime dependency the rest of the API doesn't have: **the API
process needs the `claude` binary on `PATH` and a `CLAUDE_CODE_OAUTH_TOKEN` in
its environment.** This doc records what that means for local dev and for
deploy.

## What the API needs at runtime

- **`claude` on `PATH`** — the CLI binary the extraction spawns. Install it in
  whatever environment runs `@mamen/api` (local shell, deploy container).
- **`CLAUDE_CODE_OAUTH_TOKEN`** — the OAuth token the CLI authenticates with.
  `ClaudeConfigLive` (in `packages/api/src/import/claude.ts`) reads it from the
  environment. It is an **API-process secret**: it never reaches the browser
  (that's the whole point of extracting server-side).

Nothing else in the app needs either of these — only PDF import.

## Fail-at-build, not per-call

The token is checked when the layer is **built**, not when a PDF is uploaded.
`ClaudeConfigLive` runs the SDK's designed build-time check; a missing token
fails that layer with `ClaudeTokenMissingError`, which surfaces on `ServerLive`.

Practically: **if the token is absent, the API doesn't boot** — you get a
layer-build failure at startup, not a green server that only errors when someone
tries a PDF. That's deliberate (fail loud, fail early), but it means a missing
token looks like "the whole API is down", not "PDF import is broken". Check this
first when the server won't start after touching env config.

Tests never hit this path: they provide `ClaudeCode` through `ClaudeCodeTest`'s
deep-fake executor, so CI needs no real binary or token.

## Local dev

1. Install the `claude` CLI so it's on your shell `PATH`.
2. Authenticate it and export the token the API process will read:

   ```sh
   export CLAUDE_CODE_OAUTH_TOKEN=<your-oauth-token>
   ```

   Put it in your shell profile or a local `.env` you source before `bun dev` —
   whatever your other secrets use. Without it, `bun dev` will fail at server
   layer build (see above), not at first PDF upload.

If you're not touching PDF import, you can ignore this — but note the failure
mode: an unset token takes the *whole* API down at boot, so if the server stops
starting after an env change, this is a prime suspect.

## Deploy (Dokploy)

The deploy environment has the **same** two requirements as local dev:

- The image/runtime that runs `@mamen/api` must have the `claude` CLI installed
  and on `PATH`.
- `CLAUDE_CODE_OAUTH_TOKEN` must be set as an environment variable / secret on
  the Dokploy service (alongside `DB_PATH`, `CORS_ORIGINS`, etc. from
  `packages/api/src/config.ts`).

Because the token is validated at **layer build**, a deploy that's missing it
won't come up at all — the container will fail on startup rather than serve
traffic and 502 only on PDF uploads. Treat the token as a required part of the
API service's environment, not an optional feature flag.

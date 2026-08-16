# mamen

A personal-finance app for one person's own accounts. You import bank
statements, curate the raw rows into issuers and categories, and read back where
the money went.

It is a self-hosted, single-user tool built for its author's own bank exports —
not a product, not multi-tenant, and not something you can sign up for. The
whole state is one SQLite file.

<!-- TODO: screenshots. The transactions table and the recap are the two
     surfaces worth showing. -->

## What it does

- **Transactions** — the curation surface: a filterable, paginated table of
  every imported row. Give a row an issuer, a category or a note; flag it out of
  the spend totals; group several rows into one *bundle* that the rest of the app
  treats as a single operation.
- **Transfers** — movements between your own accounts. mamen suggests debit/credit
  pairings and you confirm or dismiss them; a confirmed transfer group is held
  out of spend.
- **Recap** — where the money went over a month, a calendar year or all time,
  broken down by issuer and by category, narrowable by account. Spend only, so
  internal transfers and excluded rows are reported beside the totals rather than
  inside them.
- **Import** — upload a statement, preview what it will create, and commit.
- **Accounts** — the accounts you import into, and a grid of which months have
  been imported for each.
- **Issuers** — who money goes to or from (payees *and* income sources). Each
  issuer can carry a default category, an image, and **matching rules** — regexes,
  optionally narrowed by amount, account or sign, that auto-assign the issuer to
  matching rows at import time and retroactively.
- **Categories** — a tree of any depth. Only leaves are assignable; folders group
  and total. A transaction's category is derived through its issuer unless you
  override it on the row.

Two statement formats are supported today:

- **CSV**, parsed in the browser. One parser ships, for Green-Got, auto-detected
  by its header fingerprint, with a manual format picker for the ambiguous cases.
  Adding a bank means adding one parser module.
- **PDF**, extracted server-side by handing the file to the `claude` CLI, which
  means the statement's contents go to Anthropic's API. The upload is staged in a
  temp directory and deleted afterwards — it is never stored, and nothing reaches
  the database until you commit the preview.

Amounts are EUR only, formatted `fr-FR`. There is no multi-currency support and
no authentication of any kind — see [SECURITY.md](SECURITY.md).

## Stack

- [Bun](https://bun.sh) 1.3.4 — runtime, package manager and test runner host
- [Turborepo](https://turborepo.dev) — task graph across the five workspaces
- [Effect](https://effect.website) — the API is an Effect `HttpApi` server; the
  contract, the client and the handlers all derive from one schema
- SQLite (`@effect/sql-sqlite-bun`), migrated at server startup
- [React](https://react.dev) 19, [Vite](https://vite.dev),
  [TanStack](https://tanstack.com) Router / Query / Table / Virtual,
  [Tailwind](https://tailwindcss.com) v4, [Base UI](https://base-ui.com)
- [Vitest](https://vitest.dev) for tests, [Biome](https://biomejs.dev) for lint
  and formatting

## Packages

| Package | Path | Role |
| --- | --- | --- |
| `@mamen/shared` | `packages/shared` | The HTTP API contract and shared domain schemas. Source of truth for every entity. |
| `@mamen/api` | `packages/api` | Effect `HttpApi` server implementing the contract, over SQLite. |
| `@mamen/sdk` | `packages/sdk` | Typed client derived from the contract, wired to TanStack Query. |
| `@mamen/web` | `packages/web` | The React frontend. |
| `@mamen/landing-page` | `packages/landing-page` | The public page at the site root. Prerendered static HTML, its own image, no framework. |

Dependencies run one way: `shared` ← `api`, `shared` ← `sdk` ← `web`. Nothing in
`shared` may acquire a runtime dependency beyond `effect` and `@effect/platform`.
`landing-page` reads one string from `shared` — the prefix the app is served
under — and depends on nothing else in the repo.

## Running it locally

You need [Bun](https://bun.sh) — the repo pins `bun@1.3.4` — and, for PDF import,
the [`claude` CLI](https://docs.claude.com/en/docs/claude-code/overview) on your
`PATH`. The token that CLI authenticates with is needed either way, PDF import or
not; see below.

```sh
git clone https://github.com/lucasriondel/mamen.git
cd mamen
bun install
```

The API reads its environment from `packages/api/.env` (Bun loads it
automatically). One variable is **required**:

```sh
# packages/api/.env
CLAUDE_CODE_OAUTH_TOKEN=<your-claude-oauth-token>
```

That token is checked when the server's layers are built, not when a PDF is
uploaded — so without it **the whole API fails to start**, not just PDF import.
It is the first thing to check when the server won't boot. See
[docs/operations/claude-cli-dependency.md](docs/operations/claude-cli-dependency.md).

Then:

```sh
bun dev
```

That runs every dev server through Turborepo:

- web — <http://localhost:5070/app/> (the site root redirects there)
- API — <http://localhost:5500>, with Scalar docs at
  <http://localhost:5500/docs> and the spec at
  <http://localhost:5500/api/openapi.json>
- landing page — <http://localhost:5100>, the public page the deployed site
  serves at its root

The app is served under `/app` in development and in production alike, so the
deployed site keeps its root for public landing pages. `/api` and `/uploads`
stay at the root, outside the prefix. Vite proxies both to the API, so the
browser only ever talks to one origin and there is no CORS to configure in
development. The database is
created and migrated on first boot at `packages/api/mamen.db`, seeded with a
base category tree; delete the file to start over.

Each dev server tees its output to a gitignored log at the repo root —
`logs/web.log`, `logs/server.log` and `logs/landing-page.log`. Read those before
starting a second instance.

### Optional configuration

Everything else has a working default. The API reads:

| Variable | Default | What it does |
| --- | --- | --- |
| `PORT` | `5500` | API listen port. |
| `DB_PATH` | `mamen.db` | SQLite file, relative to the API's working directory. |
| `UPLOADS_DIR` | `uploads` | Where issuer images are written and served from. |
| `CORS_ORIGINS` | `http://localhost:5070` | Comma-separated allowed origins. Unused in production, where the SPA and the API share an origin. |
| `LOGODEV_TOKEN` | *(unset)* | Publishable logo.dev key backing issuer **Logo search**. Unset, the feature reports itself unconfigured and refuses. See [docs/operations/logo-search-setup.md](docs/operations/logo-search-setup.md). |
| `TOKEN_ENCRYPTION_KEY` | *(unset)* | 64 hex characters (`openssl rand -hex 32`) — the key AI provider credentials are encrypted with. Unset, storing one fails and stored ones read back as unreadable. No default, because a default would be a published encryption key. See [ADR 0011](docs/adr/0011-credentials-are-encrypted-at-rest.md). |

The web app reads `VITE_API_URL` (see `packages/web/.env.example`). Leave it
empty unless the API lives somewhere other than the same origin.

## Checks

```sh
bun run typecheck
bun run test
bun run lint
```

`bun run build` builds every package; `bun run --filter @mamen/web build`
produces the SPA bundle alone.

The API's `test` script runs a drift guard before Vitest: it re-derives the
OpenAPI spec from the contract and fails if `packages/api/openapi.json` no
longer matches. Change the contract and you commit the regenerated spec:

```sh
bun run --filter @mamen/api emit-openapi
```

## Deploying

Three containers behind one domain — a Bun API, an nginx-served SPA under `/app`
that proxies `/api` and `/uploads` to it, and an nginx-served landing page at the
root. The application has no authentication of its own; access control is
entirely the reverse proxy's. In the maintainer's deployment that is Cloudflare
Access over `/app`, `/api` and `/uploads`, with the site root left public.
[DEPLOY.md](DEPLOY.md) has the whole topology, the environment each container
needs, and the path split it is all derived from.

## Documentation

- [CONTRIBUTING.md](CONTRIBUTING.md) — how to get set up and what is worth sending
- [SECURITY.md](SECURITY.md) — reporting a vulnerability, and what an instance holds
- [CONTEXT-MAP.md](CONTEXT-MAP.md) — the domain vocabulary. Every term the code
  uses (*issuer*, *bundle*, *uncurated*, *transfer group*) is defined once here,
  with the words it deliberately avoids. Read this before naming anything.
- [CLAUDE.md](CLAUDE.md) — the agent-facing entry point, kept current with the
  code; it points at the per-package `CONTEXT.md` files and the skill docs under
  `docs/agents/`.
- [docs/adr/](docs/adr) — system-wide architecture decisions, with
  [packages/web/docs/adr/](packages/web/docs/adr) for frontend-only ones.

Much of this codebase is written by coding agents working one issue at a time,
which is why the prose docs are unusually load-bearing: they are the shared
context, and they are expected to be true.

## Licence

[MIT](LICENSE) © Lucas Riondel

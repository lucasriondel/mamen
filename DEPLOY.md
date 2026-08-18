# Deploying mamen

This is **one worked deployment — the maintainer's own**, written down end to
end rather than as the only way to run mamen. The hostnames are this install's;
substitute your own. Everything else (the container split, the path routing, the
volume, the access model) is what the code in this repo expects, and the parts a
test can hold to the code are held to it.

mamen runs as **three Dokploy applications** in one project, all built from this
repo: `api` (Bun, Effect HttpApi, sqlite), `web` (Vite SPA served by nginx) and
`landing-page` (prerendered static HTML served by nginx). It follows the same
shape as `miel` and `worp` on the same VPS.

Public entry is a **single domain** split by path: the root goes to
`landing-page`, `/app` to `web`. The `api` application has **no domain**: nginx
inside the web container proxies `/api` and `/uploads` to it over the internal
Docker network. That is deliberate — see [Security model](#security-model).

## The site host

The host is configuration, not source. `SITE_HOST` defaults to
`mamen.gousse.cool` — this install's — in
[`packages/landing-page/src/topology.ts`](packages/landing-page/src/topology.ts),
so a deployment that never sets it keeps working and a second one substitutes
its own without a patch.

Nothing that ships reads it: the landing page carries no absolute URL and the
SPA calls its API same-origin, which is why a host change is a DNS and reverse
proxy change rather than a rebuild. The host appears here, in the Access
application, and in the verification commands below.

## Topology

```
browser
  │  https://mamen.gousse.cool
  ▼
Cloudflare (proxied DNS + Access policy on /app, /api, /uploads)
  ▼
Traefik (Dokploy, letsencrypt) — routes by path
  │
  ├── /                    landing-page ── nginx :80     (public)
  │                                        └── one prerendered index.html
  │
  └── /app, /api, /uploads
                           web  ──  nginx :80            (behind Access)
                                    ├── /app      SPA, try_files → /app/index.html
                                    ├── /api     ──┐
                                    └── /uploads ──┤ proxy_pass ${API_UPSTREAM}
                                                   ▼
                                                  api  ──  bun :5500
                                                           └── /data  (volume: db + uploads)
```

The split is written down once as data, in
[`packages/landing-page/src/topology.ts`](packages/landing-page/src/topology.ts):
which prefix goes to which container, and which prefixes sit behind Access.
Nothing imports it at runtime — the page it sits next to ships as HTML with no
JavaScript at all — but the tables in this file are asserted against it
(`src/deploy-doc.test.ts`), and the app's prefix in it is the same
`APP_BASE_PATH` the Vite `base` and the router `basepath` read.

### Path routing

| Path | Container | Access | What it serves |
| --- | --- | --- | --- |
| `/` | `landing-page` | Public | the prerendered landing page; an unknown path is a 404 |
| `/app` | `web` | Required | the SPA shell, with `try_files` falling back to it for deep links |
| `/api` | `web` | Required | proxied to the API container over the internal Docker network |
| `/uploads` | `web` | Required | proxied to the API container, off its data volume |

Longest prefix wins, which is also how Traefik orders routers of different rule
lengths: `PathPrefix('/app')` beats the landing page's `PathPrefix('/')` with no
explicit priority. If a path ever stops reaching the container it belongs to,
that ordering is the first thing to check.

`/api` and `/uploads` must be routed to **web**, not to `landing-page`: the
landing container proxies nothing, and those two paths reach the API only
through the web container's nginx. That is the one routing mistake that reads as
"the app is broken" rather than "the route is wrong".

**Two images, not one.** The landing content is never copied into the web image
and the app's dependencies are never installed in the landing image — someone
self-hosting mamen builds the app, not the owner's public site, and the landing
image builds out of the public npm registry with no credential at all. The two
Dockerfiles are independent by design (issue #113).

The browser only ever talks to one origin. `@mamen/sdk` leaves its base URL
empty when `VITE_API_URL` is unset (`packages/sdk/src/runtime.ts`), so it calls
same-origin `/api` — which means **no CORS in production** and no need to set
`CORS_ORIGINS` on the API.

## Security model

The application has **no authentication of its own**. Every route is open to
whoever can reach it, including `POST /api/database/reset`, which wipes the
database. Access control is entirely **Cloudflare Access** in front of the
domain.

Three things must hold, or the app is world-readable:

1. **The `api` application must never be given a Dokploy domain.** A domain
   publishes it through Traefik, bypassing Cloudflare Access completely and
   exposing every endpoint — including the destructive `/api/database` group —
   unauthenticated. It is reachable only via the web container's nginx proxy.
2. **Cloudflare DNS for the host must stay proxied** (orange cloud).
   Grey-clouded, traffic reaches the VPS directly and skips the Access policy.
3. **The Access application must cover every path the `web` container answers.**
   `/app` alone is not enough: `/api` is the same database with no login screen
   in front of it.

Unlike miel, mamen uses no shared `API_SECRET` between web and api: there is no
cross-origin call to authenticate, and any value baked into a Vite bundle would
be public anyway.

## Cloudflare Access

One **self-hosted application**, three domains — not three applications. Access
issues its cookie per application, so splitting the app prefix and the API in
two means a browser that authenticated at `/app` gets a login *redirect* on its
first same-origin `fetch("/api/…")`, which arrives at the SDK as an HTML
document where JSON was expected, with no error that names the cause.

Zero Trust → Access → Applications → Add an application → Self-hosted:

| Field | Value |
| --- | --- |
| Name | `mamen` |
| Domains | `mamen.gousse.cool/app`, `mamen.gousse.cool/api`, `mamen.gousse.cool/uploads` |
| Session duration | 1 month |
| Policy | Allow · Emails · the maintainer's address |

**The site root is deliberately not in that list.** It is the public landing
page; gating it defeats the point of having one, and a stranger's first contact
with the project would be a login form. The landing container serves nothing
else — an unknown path there is a 404, not the page — so leaving it ungated
exposes exactly one prerendered HTML file and one stylesheet.

What a logged-out visitor gets, which is the pair worth checking after any
policy edit:

- <https://mamen.gousse.cool/> — the landing page, `200`, no redirect.
- <https://mamen.gousse.cool/app> — the Cloudflare login screen, `302` to
  `*.cloudflareaccess.com`.

Two things that are easy to get wrong:

- **Do not add a bypass policy for `/api`.** It is the same data as the app,
  with no login screen of its own.
- **Do not move the API under the app's prefix** to "simplify" the Access
  configuration. The path is pinned by the contract
  (`packages/shared/src/contract/api.ts`), and anything that makes the call
  cross-origin dies on a preflight that Access answers itself, with no CORS
  headers on the response.

## Dokploy applications

All three use `buildType: dockerfile` with **`dockerContextPath` = `.`** — the
repo root — because each build needs the root manifests and its workspace deps.

### `api`

| Setting | Value |
| --- | --- |
| Dockerfile | `packages/api/Dockerfile` |
| Context | `.` |
| Source | GitHub `lucasriondel/mamen`, branch `main`, autoDeploy |
| Domain | **none** |
| Watch paths | `packages/api/**`, `packages/shared/**`, `package.json`, `bun.lock`, `turbo.json` |

Environment:

| Variable | Value | Notes |
| --- | --- | --- |
| `PORT` | `5500` | Must match `API_UPSTREAM` on web. |
| `DB_PATH` | `/data/mamen.db` | On the volume. Image default. |
| `UPLOADS_DIR` | `/data/uploads` | On the volume. Image default. |
| `LOGODEV_TOKEN` | *publishable* | Optional; logo search reports itself unconfigured without it. |
| `TOKEN_ENCRYPTION_KEY` | *secret* | 64 hex characters. Required to store an AI provider credential — including the Claude Code token PDF import runs on. See below. |

The Claude Code token is deliberately **not** in that table: it is pasted in the
app's Settings page and stored encrypted, with no environment fallback. See
below.

`CORS_ORIGINS` is intentionally unset — same-origin, so its dev default is never
consulted.

### `web`

| Setting | Value |
| --- | --- |
| Dockerfile | `packages/web/Dockerfile` |
| Context | `.` |
| Source | GitHub `lucasriondel/mamen`, branch `main`, autoDeploy |
| Domain | `mamen.gousse.cool`, paths `/app`, `/api`, `/uploads` → port `80`, letsencrypt |
| Watch paths | `packages/web/**`, `packages/sdk/**`, `packages/shared/**`, `package.json`, `bun.lock`, `turbo.json` |

Three domain entries on the same host, one per path — the three rows of the
routing table that belong to this container.

Environment: `API_UPSTREAM=<api appName>:5500`. Dokploy assigns the api its
`appName` on creation (a generated slug); copy it from the api application's
page. nginx resolves it on the shared Docker network.

### `landing-page`

| Setting | Value |
| --- | --- |
| Dockerfile | `packages/landing-page/Dockerfile` |
| Context | `.` |
| Source | GitHub `lucasriondel/mamen`, branch `main`, autoDeploy |
| Domain | `mamen.gousse.cool`, path `/` → port `80`, letsencrypt |
| Watch paths | `packages/landing-page/**`, `packages/shared/**`, `package.json`, `bun.lock` |

No environment at all: the container serves static files, talks to no upstream
and reads no host name, which is why its nginx config is a plain `.conf` rather
than the `.template` the web image renders at start. `SITE_HOST` is deployment
configuration for the tables and the Access application above; no image consumes
it.

No build args on any of the three. Every image installs from the public npm
registry only — the private GitHub Packages dependency and the PAT it needed
were removed with issue #96, and the landing image is deliberately kept that way
(issue #113): it must build for anyone who clones the repo.

## Volumes

**The `api` application needs a persistent volume or all data is lost on every
redeploy** — sqlite is a file in the container, and issuer images are written to
disk. Dokploy → `api` → Advanced → Volumes:

| Type | Host / name | Mount path |
| --- | --- | --- |
| Volume | `mamen-data` | `/data` |

One mount covers both, since `DB_PATH` and `UPLOADS_DIR` both live under `/data`.

sqlite runs in WAL mode, so the on-disk set is `mamen.db`, `mamen.db-shm`, and
`mamen.db-wal` — back up or copy all three together, never `mamen.db` alone.

## The `claude` CLI dependency

PDF import spawns the `claude` CLI; the API image installs
`@anthropic-ai/claude-code` globally. The token it authenticates with is a
**stored credential, not an environment variable**: paste it into the Claude Code
tile on the app's Settings page (`claude setup-token` mints it), where it is
encrypted with `TOKEN_ENCRYPTION_KEY` and read per extraction. See
[docs/operations/claude-cli-dependency.md](docs/operations/claude-cli-dependency.md)
and [ADR 0005](docs/adr/0005-pdf-extraction-runs-server-side.md).

Note on the failure mode: the API boots with no token stored, and a missing or
wrong one surfaces only on a PDF import — a missing one as a distinct "no
credential stored" message linking to Settings, a wrong one as the generic
extraction failure. **A green container is not evidence the token works** —
verify by importing a PDF.

The token lives in the database, so it survives redeploys and is lost with the
volume. Rotating `TOKEN_ENCRYPTION_KEY` makes it unreadable: re-paste it.

## The credential encryption key

AI provider credentials pasted in the app are stored **encrypted** in the sqlite
file, under `TOKEN_ENCRYPTION_KEY` — 32 bytes of key material as 64 hex
characters:

```sh
openssl rand -hex 32
```

It has **no default**, on purpose: a default would be a published encryption key.
Unset, the API still starts and everything unrelated works, but storing a
credential fails with a 500 and any already-stored one reads back as *configured
with no hint* — present but unreadable.

**Rotating it does not re-encrypt anything.** The stored blobs stay as they are
and become unreadable; the fix is to re-paste each credential in the app. That
state is reported rather than hidden, which is why it shows as configured-but-
unreadable instead of as absent. Back it up somewhere other than the database
file: the two together are plaintext, which is exactly the pairing this defends
against (see
[ADR 0011](docs/adr/0011-credentials-are-encrypted-at-rest.md)).

## First deploy

1. Create the project and all three applications with the settings above.
2. Add the `mamen-data` volume to `api` **before** the first deploy, so the
   database is created on the volume rather than in the container filesystem.
3. Set env.
4. Deploy `api` first, then `web` (web needs the api's `appName` for
   `API_UPSTREAM`). `landing-page` depends on neither and can go any time.
5. Point Cloudflare DNS at the VPS, proxied.
6. Create the Access application above, then check the logged-out pair: the root
   serves the page, `/app` redirects to the login screen.

The database starts empty; migrations run automatically at boot
(`SqliteMigrator` in `packages/api/src/db/sql.ts`).

## Verifying a deploy

```sh
# Public, from anywhere, logged out: the landing page, 200.
curl -sI https://mamen.gousse.cool/

# Behind Access: a 302 to the Cloudflare login when logged out.
curl -sI https://mamen.gousse.cool/app

# Once authenticated in a browser, the API answers on the same origin:
#   https://mamen.gousse.cool/api/health   → {"status":"ok"}
```

Inside the VPS, against the containers directly:

```sh
docker exec <web-container> wget -qO- http://<api-appName>:5500/api/health
```

Four things distinguish a correct routing from a plausible one:

- `/` serves the landing page — its `<h1>mamen</h1>`, not the SPA shell — and
  serves it **without** an Access redirect.
- `/app/` serves the app, and an SPA deep link (e.g. `/app/transactions`)
  returns `200 text/html`, not 404 — that exercises the web container's
  `try_files` fallback.
- `/api/health` answers `{"status":"ok"}`, which means it reached **web** and
  was proxied on, not the landing container (which would 404).
- `/api/health` in a **private window** does *not* answer `{"status":"ok"}`. If
  it does, the Access application is missing that path and the database is open.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `502` on `/api/*`, SPA loads fine | `API_UPSTREAM` wrong, or api container down. Check the api's `appName` and port. |
| Data gone after a redeploy | Volume missing on `api`, or `DB_PATH` pointing outside `/data`. |
| Build fails on `better-sqlite3` / node-gyp | An install lost its `--filter`; the api's dev-only `@effect/sql-sqlite-node` is being resolved. |
| PDF import fails, everything else fine | The stored Claude Code token is invalid or expired — re-paste it in Settings. |
| PDF import says no credential is stored | No Claude Code token has been pasted in Settings, or `TOKEN_ENCRYPTION_KEY` changed so the stored one is unreadable. |
| Logo search reports unconfigured | `LOGODEV_TOKEN` unset — see [docs/operations/logo-search-setup.md](docs/operations/logo-search-setup.md). |
| `404` on `/api/*` while `/` serves the landing page | The API's paths are routed to `landing-page`, which proxies nothing. `/app`, `/api` and `/uploads` all belong to **web**. |
| The landing page appears at `/app` too | The web application is missing its `/app` domain entry, so Traefik falls through to the root router. |
| The app loads, then every request fails parsing | `/api` is not in the same Access application as `/app`; the SDK is getting a login page where JSON was expected. |
| A visitor reports a login prompt on the landing page | The site root was added to the Access application, or a policy covers the bare host rather than the paths. |
| A stored provider credential shows as configured with no hint | `TOKEN_ENCRYPTION_KEY` changed or was lost — the blob is unreadable. Re-paste the credential. (A very short credential also shows no hint, and is readable.) |
| Pasting a provider credential returns a `500` | `TOKEN_ENCRYPTION_KEY` unset, or not 64 hex characters. |

## Self-hosting on one host (`docker compose`)

Everything above is the maintainer's production deploy. `docker-compose.yml` at
the repo root is a second, smaller path: from a clean clone,

```sh
cp .env.example .env    # fill in TOKEN_ENCRYPTION_KEY
docker compose up --build
```

brings the app up at `http://localhost:8080/app/` (`WEB_PORT` moves it). It runs
the same two images, the same way: `api` publishes no port, `web`'s nginx
proxies `/api` and `/uploads` to it as `api:5500`, and a named volume
`mamen-data` at `/data` holds the database and the uploaded images, so data
survives `docker compose down` and a rebuild. `landing-page` is not part of it —
a self-hosted install is the app, and the compose file serves `/` by redirecting
into `/app/`.

The one thing it does **not** carry over is the access boundary. There is no
Cloudflare Access in front of it and the app has no authentication of its own,
so whatever can reach the published port can read and write everything,
`POST /api/database/reset` included. Publish it to a LAN, a VPN or a reverse
proxy that authenticates — not to the internet.

There is deliberately **no dev compose file**. Its only job would be to start a
database, and there is no database server to start: sqlite is a file the API
opens in-process and the migrator creates at boot. Local development is
`bun dev`.

## Making the repository public

The repository is private, and the flip is effectively irreversible: anything
public may be cloned or indexed within minutes, so "it can always go private
again" is true of the page and not of the content.

Before flipping, in order:

1. **Confirm the history is clean — check, do not assume.** A real bank
   statement was committed at the repo root and copied into an import fixture
   (issue #108). The working tree is scrubbed and guarded by a test; the history
   is a separate job:

   ```sh
   git log --all --full-history -- 'relevé_de_comptes*.csv'   # expect: nothing
   scripts/scrub-bank-statements.sh --verify                  # expect: clean
   ```

   `--verify` hashes every reachable blob, so it catches a copy re-added under
   any name; the `git log` is the criterion as issue #108 words it. If either is
   red, the rewrite in `scripts/scrub-bank-statements.sh` has not been run and
   force-pushed yet — a coordinated history rewrite on the default branch, not a
   step to take in passing. Run it from
   [docs/operations/bank-statement-scrub.md](docs/operations/bank-statement-scrub.md),
   which is the whole operation in order, and do not flip until its last step
   is green: a force-push leaves the old commits fetchable by SHA until GitHub
   collects them, so the scrub wants to be finished and settled *before* the
   repository is public, not after.

2. **Re-run the working-tree guard**: `bun run --filter @mamen/web test`, which
   includes `bank-statement-scrubbed.test.ts` — no statement bytes anywhere in
   the tree, and no French IBAN outside the synthetic fixture.

3. **Get the owner's explicit go-ahead.** It is their data, and the decision is
   one-way.

4. Flip it:

   ```sh
   gh repo edit lucasriondel/mamen --visibility public --accept-visibility-change-consequences
   ```

5. Afterwards, look at what became world-readable that was not meant to be: the
   Actions logs of past runs, and any issue or PR body that quoted a real
   statement row.

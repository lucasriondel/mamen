# Deploy (Dokploy + Cloudflare)

mamen runs as **two Dokploy applications** in one project, both built from this
repo: `api` (Bun, Effect HttpApi, sqlite) and `web` (Vite SPA served by nginx).
It follows the same shape as `miel` and `worp` on the same VPS.

Public entry is a **single domain**, `mamen.gousse.cool`, pointing at `web`.
The `api` application has **no domain**: nginx inside the web container proxies
`/api` and `/uploads` to it over the internal Docker network. That is deliberate
— see [Security model](#security-model).

## Topology

```
browser
  │  https://mamen.gousse.cool
  ▼
Cloudflare (proxied DNS + Access policy)
  ▼
Traefik (Dokploy, letsencrypt)
  ▼
web  ──  nginx :80
         ├── /            SPA, try_files → index.html
         ├── /api     ──┐
         └── /uploads ──┤ proxy_pass ${API_UPSTREAM}
                        ▼
                       api  ──  bun :5500
                                └── /data  (volume: db + uploads)
```

The browser only ever talks to one origin. `@mamen/sdk` leaves its base URL
empty when `VITE_API_URL` is unset (`packages/sdk/src/runtime.ts`), so it calls
same-origin `/api` — which means **no CORS in production** and no need to set
`CORS_ORIGINS` on the API.

## Security model

The application has **no authentication of its own**. Every route is open to
whoever can reach it. Access control is entirely **Cloudflare Access** in front
of `mamen.gousse.cool`.

Two consequences that must hold, or the app is world-readable:

1. **The `api` application must never be given a Dokploy domain.** A domain
   publishes it through Traefik, bypassing Cloudflare Access completely and
   exposing every endpoint — including the destructive `/api/database` group —
   unauthenticated. It is reachable only via the web container's nginx proxy.
2. **Cloudflare DNS for `mamen` must stay proxied** (orange cloud). Grey-clouded,
   traffic reaches the VPS directly and skips the Access policy.

Unlike miel, mamen uses no shared `API_SECRET` between web and api: there is no
cross-origin call to authenticate, and any value baked into a Vite bundle would
be public anyway.

## Dokploy applications

Both use `buildType: dockerfile` with **`dockerContextPath` = `.`** — the repo
root — because each build needs the root manifests and its workspace deps.

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
| `CLAUDE_CODE_OAUTH_TOKEN` | *secret* | Required — see below. |
| `LOGODEV_TOKEN` | *publishable* | Optional; logo search reports itself unconfigured without it. |

`CORS_ORIGINS` is intentionally unset — same-origin, so its dev default is never
consulted.

### `web`

| Setting | Value |
| --- | --- |
| Dockerfile | `packages/web/Dockerfile` |
| Context | `.` |
| Source | GitHub `lucasriondel/mamen`, branch `main`, autoDeploy |
| Domain | `mamen.gousse.cool` → port `80`, letsencrypt |
| Watch paths | `packages/web/**`, `packages/sdk/**`, `packages/shared/**`, `package.json`, `bun.lock`, `turbo.json` |

Environment: `API_UPSTREAM=<api appName>:5500`. Dokploy assigns the api its
`appName` on creation (a generated slug); copy it from the api application's
page. nginx resolves it on the shared Docker network.

Build args: `NODE_AUTH_TOKEN=<GitHub PAT with read:packages>` — needed for the
private `@lucasriondel/gousse-ui`. The api image needs **no** token: its install
is filtered to `@mamen/api`, which has no private dependency.

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
`@anthropic-ai/claude-code` globally and needs `CLAUDE_CODE_OAUTH_TOKEN` in its
environment. See [claude-cli-dependency.md](./claude-cli-dependency.md) and
[ADR 0005](../adr/0005-pdf-extraction-runs-server-side.md).

Note on the failure mode: that doc says a missing token fails at layer build and
prevents boot. In practice the container starts with a syntactically valid but
wrong token, and the failure surfaces only on the first PDF import. **A green
container is not evidence the token works** — verify by importing a PDF.

## First deploy

1. Create the project and both applications with the settings above.
2. Add the `mamen-data` volume to `api` **before** the first deploy, so the
   database is created on the volume rather than in the container filesystem.
3. Set env and build args.
4. Deploy `api` first, then `web` (web needs the api's `appName` for
   `API_UPSTREAM`).
5. Point Cloudflare DNS `mamen` at the VPS, proxied, and attach the Access
   policy.

The database starts empty; migrations run automatically at boot
(`SqliteMigrator` in `packages/api/src/db/sql.ts`).

## Verifying a deploy

```sh
# Through Cloudflare — expect the Access login unless already authenticated.
curl -sI https://mamen.gousse.cool/

# Once authenticated in a browser, the API answers on the same origin:
#   https://mamen.gousse.cool/api/health   → {"status":"ok"}
```

Inside the VPS, against the containers directly:

```sh
docker exec <web-container> wget -qO- http://<api-appName>:5500/api/health
```

An SPA deep link (e.g. `/transactions`) must return `200 text/html`, not 404 —
that exercises the nginx `try_files` fallback.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `502` on `/api/*`, SPA loads fine | `API_UPSTREAM` wrong, or api container down. Check the api's `appName` and port. |
| Data gone after a redeploy | Volume missing on `api`, or `DB_PATH` pointing outside `/data`. |
| Build 401s on `@lucasriondel/gousse-ui` | `NODE_AUTH_TOKEN` build arg missing/expired on `web`. |
| Build fails on `better-sqlite3` / node-gyp | An install lost its `--filter`; the api's dev-only `@effect/sql-sqlite-node` is being resolved. |
| PDF import fails, everything else fine | `CLAUDE_CODE_OAUTH_TOKEN` invalid or expired. |
| Logo search reports unconfigured | `LOGODEV_TOKEN` unset — see [logo-search-setup.md](./logo-search-setup.md). |

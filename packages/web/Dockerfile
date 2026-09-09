# @mamen/web — Vite SPA built with Bun, served by nginx.
#
# Build context is the REPO ROOT (Dokploy: dockerContextPath `.`): the build
# needs the root manifests plus the `@mamen/sdk` and `@mamen/shared` workspace
# sources it imports directly (both are TS-source packages, no dist).
FROM oven/bun:1.3.4 AS build

WORKDIR /app

COPY package.json bun.lock ./
# `patchedDependencies` in the root manifest names a file under `patches/`,
# and bun validates that entry for the whole workspace — `--filter` does not
# narrow it. Without this the install fails on a patch file it cannot find.
COPY patches ./patches
COPY packages/api/package.json ./packages/api/
COPY packages/web/package.json ./packages/web/
COPY packages/sdk/package.json ./packages/sdk/
COPY packages/shared/package.json ./packages/shared/
# Every workspace member the lockfile resolves must be present, or bun sees a
# changed lockfile and --frozen-lockfile fails — even though --filter means
# this package's dependencies are never installed.
COPY packages/landing-page/package.json ./packages/landing-page/

# Every dependency here is public: the private GitHub Packages one went with
# issue #96, and with it the registry credential this stage used to take as a
# build arg. Nothing in the build needs a token.
#
# `--filter @mamen/web` restricts the install to this package's subgraph.
# Unfiltered, it also resolves the api's dev dep `@effect/sql-sqlite-node`,
# whose `better-sqlite3` needs node-gyp and fails in this image. devDependencies
# are kept (unlike the api image) — vite and tsc run the build below.
RUN --mount=type=cache,target=/root/.bun/install/cache \
	bun install --frozen-lockfile --filter @mamen/web

COPY packages/shared ./packages/shared
COPY packages/sdk ./packages/sdk
COPY packages/web ./packages/web
COPY tsconfig.base.json tsconfig.json ./

# VITE_API_URL is deliberately left unset: the SDK falls back to a same-origin
# base (sdk/src/runtime.ts), so the browser calls `/api` on this very host and
# nginx proxies it internally. No cross-origin, hence no CORS and no public
# route to the API.
RUN bun run --filter @mamen/web build

FROM nginx:1.27-alpine

# `.template` is rendered by nginx's stock envsubst entrypoint at container
# start; API_UPSTREAM is supplied by the Dokploy env.
COPY packages/web/nginx.conf.template /etc/nginx/templates/default.conf.template

# Under the nginx root, in a directory named for the path prefix the app is
# served at (`APP_BASE_PATH`, packages/shared/src/app-base-path.ts). The build
# already emits `/app/…` asset URLs, and nginx resolves `$uri` against this
# root, so the prefix has to exist on disk — the alternative, an `alias`, buys
# nothing and hides where the files are. This is the last of the four copies of
# that literal; the other three are the Vite base, the router basepath and
# nginx.conf.template.
COPY --from=build /app/packages/web/dist /usr/share/nginx/html/app

ENV API_UPSTREAM=mamen-api:5500

EXPOSE 80

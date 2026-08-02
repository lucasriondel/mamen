# @mamen/web — Vite SPA built with Bun, served by nginx.
#
# Build context is the REPO ROOT (Dokploy: dockerContextPath `.`): the build
# needs the root manifests plus the `@mamen/sdk` and `@mamen/shared` workspace
# sources it imports directly (both are TS-source packages, no dist).
FROM oven/bun:1.3.4 AS build

WORKDIR /app

COPY package.json bun.lock .npmrc ./
COPY packages/api/package.json ./packages/api/
COPY packages/web/package.json ./packages/web/
COPY packages/sdk/package.json ./packages/sdk/
COPY packages/shared/package.json ./packages/shared/

# `@lucasriondel/gousse-ui` is a private GitHub Packages dep of web; `.npmrc`
# reads NODE_AUTH_TOKEN from the env to authenticate. Kept to this RUN and the
# file deleted after, so no token survives into a layer. This stage is discarded
# anyway — only `dist/` is copied forward.
#
# `--filter @mamen/web` restricts the install to this package's subgraph.
# Unfiltered, it also resolves the api's dev dep `@effect/sql-sqlite-node`,
# whose `better-sqlite3` needs node-gyp and fails in this image. devDependencies
# are kept (unlike the api image) — vite and tsc run the build below.
ARG NODE_AUTH_TOKEN
RUN --mount=type=cache,target=/root/.bun/install/cache \
	NODE_AUTH_TOKEN="${NODE_AUTH_TOKEN}" bun install --frozen-lockfile --filter @mamen/web \
	&& rm -f .npmrc

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

COPY --from=build /app/packages/web/dist /usr/share/nginx/html

ENV API_UPSTREAM=mamen-api:5500

EXPOSE 80

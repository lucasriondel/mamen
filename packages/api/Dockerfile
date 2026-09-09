# @mamen/api — Bun HTTP server (Effect HttpApi) over sqlite.
#
# Single-stage on the Debian-based `oven/bun` image, not alpine: `sharp` ships
# glibc prebuilt binaries, and the sqlite migrator shells out to the `sqlite3`
# binary for its schema dump. Both would break on musl.
#
# Build context is the REPO ROOT (Dokploy: dockerContextPath `.`), because the
# workspace install needs the root `package.json` + `bun.lock` and every
# workspace package that `@mamen/api` resolves.
FROM oven/bun:1.3.4

# - sqlite3: shelled out to by SqliteMigrator's schema dump (db/sql.ts)
# - ca-certificates: outbound TLS for logo.dev lookups (net/outbound.ts)
# - nodejs/npm: the `claude` CLI is a Node package and spawns under Node
RUN apt-get update \
	&& apt-get install -y --no-install-recommends \
		sqlite3 \
		ca-certificates \
		nodejs \
		npm \
	&& rm -rf /var/lib/apt/lists/*

# The `claude` CLI must be on PATH: PDF import spawns it (ADR 0005, and
# docs/operations/claude-cli-dependency.md). The token it authenticates with is
# no runtime env var but a credential pasted in the app's Settings page (issue
# #122), so the container starts with none stored and PDF import alone is what
# fails until one is.
RUN npm install -g @anthropic-ai/claude-code && claude --version

WORKDIR /app

# Manifests first so the install layer caches independently of source edits.
# Every workspace package is copied, not just `api`: the lockfile is resolved
# for the whole workspace, so a missing member fails `--frozen-lockfile`.
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

# `--filter @mamen/api` installs only this package's subgraph, so web's
# dependencies are never resolved here. (It also used to be what kept the api
# image away from web's private GitHub Packages dependency, which 401'd without
# a registry token; that dependency is gone as of issue #96, so no install path
# in this repo needs a credential any more.)
#
# `--production` skips devDependencies, which matters beyond image size here:
# `@effect/sql-sqlite-node` (the `:memory:` test layer's driver) pulls
# `better-sqlite3`, a node-gyp build that fails in this image. Production runs
# on `@effect/sql-sqlite-bun` and never loads it.
RUN --mount=type=cache,target=/root/.bun/install/cache \
	bun install --frozen-lockfile --production --filter @mamen/api

# Source. `@mamen/api` runs straight off TypeScript under Bun (its `start`
# script is `bun src/index.ts`), so there is no build step to run here.
COPY packages/shared ./packages/shared
COPY packages/api ./packages/api
COPY tsconfig.base.json tsconfig.json ./

# Defaults matching the volume layout in DEPLOY.md. Both live
# under /data so a single mount covers the database and the uploaded issuer
# images; Dokploy env can override either.
ENV NODE_ENV=production \
	PORT=5500 \
	DB_PATH=/data/mamen.db \
	UPLOADS_DIR=/data/uploads

RUN mkdir -p /data/uploads

EXPOSE 5500

CMD ["bun", "packages/api/src/index.ts"]

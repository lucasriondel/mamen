# @mamen/landing-page — the public site at the domain root, prerendered to
# static HTML by Vite and served by nginx.
#
# Independent of packages/web's Dockerfile on purpose (issue #113): the two are
# separate images behind one reverse proxy, so the landing copy never rides
# along in the app image and the app's tree never reaches the image that ships
# from here. The build's whole output is HTML and one stylesheet: React and the
# router are installed below and render the page (issues #145, #148), but they
# run in Node, at build time, in a stage that is thrown away — the image that
# ships carries no JavaScript at all. That division is the decision recorded in
# docs/adr/0002-react-renders-the-landing-page-at-build-time.md.
#
# Build context is the REPO ROOT (Dokploy: dockerContextPath `.`), because the
# workspace install reads the root manifests and the lockfile.
FROM oven/bun:1.3.4 AS build

WORKDIR /app

# Every workspace manifest, not just this one: the lockfile is resolved for the
# whole workspace, so a missing member fails `--frozen-lockfile`. Manifests
# only — no application source is copied into this image, and none of these
# packages' dependencies are installed (see the filter below).
COPY package.json bun.lock ./
# `patchedDependencies` in the root manifest names a file under `patches/`, and
# bun validates that entry for the whole workspace — `--filter` does not narrow
# it. Without this the install fails on a patch file it cannot find.
COPY patches ./patches
COPY packages/api/package.json ./packages/api/
COPY packages/web/package.json ./packages/web/
COPY packages/sdk/package.json ./packages/sdk/
COPY packages/shared/package.json ./packages/shared/
COPY packages/landing-page/package.json ./packages/landing-page/

# `--filter @mamen/landing-page` restricts the install to this package's
# subgraph: vite, typescript, vitest, react, `@tanstack/react-router`, the
# `@mamen/shared` workspace link — and, because a workspace dependency brings
# its own, shared's `effect`. What is never resolved is the app itself: no
# Tailwind, no query client, none of the api's native modules. (The root
# manifest's own devDependencies — turbo, oxlint, oxfmt — come along with any
# install here; verified by listing the tree.) devDependencies are kept, unlike
# the api image: vite, tsc and the page's own React all run the build. React is
# a devDependency for exactly this reason — it is build tooling here, not
# something a browser is sent (`src/packaging.test.ts`).
#
# None of it reaches the image that ships. This stage is thrown away and the
# final one below copies two files out of it.
#
# No build arg and no registry credential: every dependency here comes from the
# public npm registry. That is a property worth keeping — this image is the
# owner's public site, and it should build for anyone who clones the repo.
RUN --mount=type=cache,target=/root/.bun/install/cache \
	bun install --frozen-lockfile --filter @mamen/landing-page

# `@mamen/shared` is the one workspace package this build reads, and it reads
# one string out of it: APP_BASE_PATH, the prefix the app is served under, so
# the link into the app cannot drift from where nginx puts it.
COPY packages/shared ./packages/shared
COPY packages/landing-page ./packages/landing-page

RUN bun run --filter @mamen/landing-page build

FROM nginx:1.27-alpine

# A plain config, not a `.template`: nothing here is substituted at container
# start, because this container proxies nothing and has no upstream. (The web
# image's template exists for ${API_UPSTREAM}.)
COPY packages/landing-page/nginx.conf /etc/nginx/conf.d/default.conf

# At the nginx root, unprefixed — this site *is* the root. The app's image
# lands its build in a subdirectory named for its prefix instead; the reverse
# proxy in front decides which container a path reaches.
COPY --from=build /app/packages/landing-page/dist /usr/share/nginx/html

EXPOSE 80

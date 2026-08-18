import { existsSync, readdirSync, readFileSync } from "node:fs";
import { API_DEV_PORT } from "@mamen/shared/ports";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

/**
 * The root `docker-compose.yml`: the self-hosting path, where
 * `docker compose up --build` brings the whole app up on one host (issue #140).
 *
 * It is the only file in the repo that nobody runs during development and whose
 * breakage is invisible until an operator's data is already gone. Three of its
 * mistakes are silent and expensive:
 *
 * - **a `ports:` entry on `api`** publishes an API with no authentication of its
 *   own — `POST /api/database/reset` included — on the host. DEPLOY.md is
 *   explicit that the API has no public route; here the web container's nginx is
 *   the only way in.
 * - **a missing volume** loses the sqlite file and every uploaded issuer image
 *   on the next `docker compose down`, with nothing in the logs to say so.
 * - **an `API_UPSTREAM` that names the wrong host or port** is a 502 on every
 *   request, and the two halves of that string live in two different services.
 *
 * Facts are *derived* wherever they have a home elsewhere: the api port from
 * `packages/api/src/config.ts`, the data paths from the api image's own
 * defaults, the web container's port from its `EXPOSE`. A restated copy here
 * would assert the compose file against this test rather than against the app.
 *
 * Parsed rather than grepped: `ports:` in a comment explaining why there is no
 * `ports:` is the same bytes to a substring search.
 *
 * Lives under `src/test/` because its subject is the repo, not a component
 * (same as `ci-workflow.test.ts`). Paths are cwd-relative — vitest runs from
 * the package root — so the root is `../../`.
 */

const ROOT = "../..";
const read = (path: string) => readFileSync(`${ROOT}/${path}`, "utf8");

const COMPOSE_FILE = "docker-compose.yml";
const ENV_EXAMPLE = ".env.example";

type Service = {
  build?: { context?: string; dockerfile?: string; args?: unknown };
  environment?: Record<string, string | number | null>;
  ports?: string[];
  volumes?: string[];
  depends_on?: string[];
  restart?: string;
};

type Compose = {
  services?: Record<string, Service>;
  volumes?: Record<string, unknown>;
};

const composeText = () => read(COMPOSE_FILE);
const compose = (): Compose => parse(composeText());
const services = () => compose().services ?? {};
const service = (name: string): Service => services()[name] ?? {};

/** `KEY: value` environment, as strings, for whichever service. */
const env = (name: string): Record<string, string> =>
  Object.fromEntries(
    Object.entries(service(name).environment ?? {}).map(([key, value]) => [
      key,
      String(value ?? ""),
    ]),
  );

/** The env names `packages/api/src/config.ts` actually reads. */
const apiConfigEnv = new Set(
  [...read("packages/api/src/config.ts").matchAll(/Config\.\w+\("(\w+)"\)/g)].map(
    (match) => match[1] as string,
  ),
);

/**
 * The API's own listen-port default, from the one place that decides it: the
 * port registry in `@mamen/shared/ports` (issue #137). The api config used to
 * hold the literal and was read out of it here; it now imports the row, so
 * reading the number back out of that file would only find the constant's
 * name. The chain is asserted rather than assumed — see the test below.
 */
const apiPortDefault = () => String(API_DEV_PORT);

/** How `packages/api/src/config.ts` spells its `PORT` default. */
const apiPortDefaultSource = () =>
  read("packages/api/src/config.ts").match(
    /Config\.integer\("PORT"\)[\s\S]*?withDefault\((\w+)\)/,
  )?.[1] as string;

/** `ENV NAME=value` defaults baked into an image. */
function imageEnv(dockerfile: string): Record<string, string> {
  const out: Record<string, string> = {};

  for (const [, name, value] of read(dockerfile).matchAll(
    /^(?:ENV\s+|\t)([A-Z_][A-Z0-9_]*)=(\S+)/gm,
  )) {
    out[name as string] = value as string;
  }

  return out;
}

/** The port an image says it listens on. */
const exposedPort = (dockerfile: string) =>
  read(dockerfile).match(/^EXPOSE\s+(\d+)/m)?.[1] as string;

/**
 * `HOST:CONTAINER` (or `HOST:CONTAINER/proto`), split at the *last* colon: the
 * host side is an interpolation, `${WEB_PORT:-8080}`, which carries one of its
 * own.
 */
const publishedPorts = (name: string) =>
  (service(name).ports ?? []).map((entry) => {
    const [, host, container] = entry.split("/")[0].match(/^(.*):(\d+)$/) as RegExpMatchArray;
    return { host, container };
  });

/** `SOURCE:TARGET` mounts, split. */
const mounts = (name: string) =>
  (service(name).volumes ?? []).map((entry) => {
    const [source, target] = entry.split(":");
    return { source, target };
  });

/** The exclusion patterns of `.dockerignore`, comments and blanks dropped. */
const dockerignore = () =>
  read(".dockerignore")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));

/** Every variable the compose file interpolates, `${VAR}` or `${VAR:-default}`. */
const interpolated = () =>
  new Set(
    [...composeText().matchAll(/\$\{([A-Z_][A-Z0-9_]*)(?::?-[^}]*)?\}/g)].map(
      (match) => match[1] as string,
    ),
  );

/** `NAME=` lines in a dotenv file, commented-out ones included. */
const documented = (text: string) =>
  new Set([...text.matchAll(/^#?\s*([A-Z_][A-Z0-9_]*)=/gm)].map((match) => match[1] as string));

describe("the production compose file", () => {
  it("exists at the repo root", () => {
    expect(existsSync(`${ROOT}/${COMPOSE_FILE}`)).toBe(true);
  });

  it("defines exactly the two services the app is made of", () => {
    // The landing page is deliberately out: it is a separate image serving the
    // public site root, and self-hosting is the app, not the marketing page.
    expect(Object.keys(services()).sort()).toStrictEqual(["api", "web"]);
  });

  it("builds both images from the repo root, as their Dockerfiles require", () => {
    for (const name of ["api", "web"]) {
      const build = service(name).build ?? {};
      const dockerfile = `packages/${name}/Dockerfile`;

      // Both images copy the root manifests and their workspace deps, so a
      // context of `packages/<name>` cannot build them at all.
      expect(build.context, name).toBe(".");
      expect(build.dockerfile, name).toBe(dockerfile);
      expect(existsSync(`${ROOT}/${dockerfile}`), dockerfile).toBe(true);
    }
  });

  it("brings both containers back after a host reboot", () => {
    for (const name of ["api", "web"]) {
      expect(service(name).restart, name).toBe("unless-stopped");
    }
  });
});

describe("the api service", () => {
  it("publishes no host port", () => {
    // The whole security model: the API has no authentication of its own, so
    // the web container's nginx — and in the maintainer's deploy, Cloudflare
    // Access in front of it — is the only path to it. A `ports:` entry here
    // puts `POST /api/database/reset` on the host, unauthenticated.
    expect(service("api").ports).toBeUndefined();
  });

  it("listens on the port its own config defaults to", () => {
    expect(env("api").PORT).toBe(apiPortDefault());
    expect(exposedPort("packages/api/Dockerfile")).toBe(apiPortDefault());
  });

  it("takes that port from the registry, not from a literal of its own", () => {
    // What makes the assertion above a derivation rather than a coincidence:
    // the number comes from `@mamen/shared/ports`, so the api config has to be
    // reading the same row. A literal back in `config.ts` would let the two
    // drift while every test here still passed.
    expect(apiPortDefaultSource()).toBe("API_DEV_PORT");
  });

  it("keeps the database and the uploads on one named volume", () => {
    const data = mounts("api");
    expect(data).toHaveLength(1);

    const [mount] = data;
    // Named, not a bind: `docker compose down` removes the containers, and a
    // volume declared at the top level is what survives it.
    expect(mount.source).not.toMatch(/^[./~]/);
    expect(Object.keys(compose().volumes ?? {})).toContain(mount.source);

    // One mount covers both because both paths live under it — the api image
    // already defaults them there, and this only has to not move them.
    const image = imageEnv("packages/api/Dockerfile");
    for (const name of ["DB_PATH", "UPLOADS_DIR"]) {
      const path = env("api")[name] ?? image[name];
      expect(path, name).toBe(image[name]);
      expect(path.startsWith(`${mount.target}/`), path).toBe(true);
    }
  });

  it("passes the credential key through rather than inventing one", () => {
    // A default would be a published encryption key (ADR 0011), and a value
    // that changes per run makes every stored credential unreadable — the
    // failure DEPLOY.md warns about, arriving without anyone rotating anything.
    // biome-ignore lint/suspicious/noTemplateCurlyInString: compose's own interpolation syntax, which is the subject here
    expect(env("api").TOKEN_ENCRYPTION_KEY).toBe("${TOKEN_ENCRYPTION_KEY:-}");
  });

  it("carries no claude token, which is not an environment variable", () => {
    // Since issue #122 it is a credential pasted in Settings, read from the
    // encrypted store and nowhere else.
    expect(composeText()).not.toContain("CLAUDE_CODE_OAUTH_TOKEN");
  });

  it("sets only variables the API reads", () => {
    for (const name of Object.keys(env("api"))) {
      expect([...apiConfigEnv, "NODE_ENV"], name).toContain(name);
    }
  });
});

describe("the web service", () => {
  it("publishes the app's only host port, onto nginx's", () => {
    const ports = publishedPorts("web");
    expect(ports).toHaveLength(1);
    expect(ports[0].container).toBe(exposedPort("packages/web/Dockerfile"));
    expect(ports[0].host).toMatch(/^\$\{[A-Z_]+:?-\d+\}$/);
  });

  it("points nginx at the api service on the compose network", () => {
    // The two halves of this string live in two services; `api` is the name
    // docker's DNS answers for, and the port is whatever the api listens on.
    expect(env("web").API_UPSTREAM).toBe(`api:${env("api").PORT}`);
    expect(read("packages/web/nginx.conf.template")).toContain(
      // biome-ignore lint/suspicious/noTemplateCurlyInString: nginx's envsubst placeholder, read as text
      "${API_UPSTREAM}",
    );
  });

  it("starts after the api", () => {
    expect(service("web").depends_on).toContain("api");
  });

  it("leaves VITE_API_URL unset, so the browser calls /api same-origin", () => {
    // Set, it would make the browser call the API cross-origin — a public route
    // to the API, plus CORS, plus a preflight nothing answers. It is also a
    // *build*-time variable, so a runtime `environment:` entry for it would do
    // nothing at all while reading as configuration.
    //
    // Asserted against the parsed file, not its text: a comment saying why the
    // variable is absent is the reason to have one.
    for (const name of Object.keys(services())) {
      expect(Object.keys(env(name)), name).not.toContain("VITE_API_URL");
      expect(Object.keys((service(name).build?.args as object) ?? {}), name).not.toContain(
        "VITE_API_URL",
      );
    }
  });
});

describe("what a local build sends to the daemon", () => {
  it("excludes a developer's own .env, wherever in the tree it sits", () => {
    // Until this file existed, every build ran from a fresh clone (Dokploy),
    // where no `.env` is checked out. `docker compose up --build` runs from a
    // working tree, and this repo's development env file is
    // `packages/api/.env` — a real `TOKEN_ENCRYPTION_KEY`, baked into an image
    // layer by `COPY packages/api ./packages/api` and shipped with it.
    //
    // The root-level entries alone do not cover it: .dockerignore patterns are
    // matched against the context root, so `.env` means `/.env` and nothing
    // else, the same reason this file already lists `**/node_modules` beside
    // `node_modules`.
    expect(dockerignore()).toContain("**/.env");
    expect(dockerignore()).toContain("**/.env.local");
  });

  it("keeps the .env.example files, which are what an operator copies", () => {
    // The one thing the pattern above must not swallow: every documented
    // variable in this repo lives in a `.env.example`, and the compose file's
    // own is read straight off the context root.
    expect(dockerignore().filter((pattern) => pattern.includes(".env.example"))).toStrictEqual([]);
  });
});

describe("the operator's .env.example", () => {
  it("exists", () => {
    expect(existsSync(`${ROOT}/${ENV_EXAMPLE}`)).toBe(true);
  });

  it("documents every variable the compose file reads, and none it does not", () => {
    expect([...documented(read(ENV_EXAMPLE))].sort()).toStrictEqual([...interpolated()].sort());
  });

  it("leads with the key whose loss makes stored credentials unreadable", () => {
    expect(documented(read(ENV_EXAMPLE))).toContain("TOKEN_ENCRYPTION_KEY");
    expect(read(ENV_EXAMPLE)).toContain("openssl rand -hex 32");
  });

  it("says the claude token is pasted in Settings, not set here", () => {
    expect(read(ENV_EXAMPLE)).not.toContain("CLAUDE_CODE_OAUTH_TOKEN");
    expect(read(ENV_EXAMPLE)).toMatch(/Settings/);
  });

  it("ships no value that would be a secret if copied", () => {
    // Every non-comment line is either empty or a bare `NAME=`: an operator
    // copies the file and fills it in, and a shipped default for a secret is a
    // secret everyone has.
    const filled = read(ENV_EXAMPLE)
      .split("\n")
      .filter((line) => /^[A-Z_][A-Z0-9_]*=.+/.test(line));

    expect(filled).toStrictEqual([]);
  });
});

describe("the compose files in the repo", () => {
  it("are the one production file, with no dev companion", () => {
    // A dev compose file's only job would be "up just the database", and there
    // is no database server to up — sqlite is a file the API opens in-process.
    // Local development is `bun dev`.
    const found = readdirSync(ROOT).filter((name) => /^(docker-)?compose.*\.ya?ml$/.test(name));

    expect(found).toStrictEqual([COMPOSE_FILE]);
  });
});

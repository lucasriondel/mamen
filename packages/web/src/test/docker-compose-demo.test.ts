import { existsSync } from "node:fs";
import { basename } from "node:path";
import {
  COMPOSE_STACK_WEB_PORT,
  DEMO_STACK_API_PORT,
  DEMO_STACK_WEB_PORT,
  portsOfKind,
} from "@mamen/shared/ports";
import { describe, expect, it } from "vitest";
import { composeFile, exposedPort, imageEnv, readRepoFile, repoPath } from "./compose-file";

/**
 * `docker-compose.demo.yml`: the throwaway stack that serves the seeded demo
 * database for screenshots (issue #141).
 *
 * It is not a deploy path. Nobody's data lives in it, it is brought up to be
 * photographed and destroyed afterwards, and the whole of its value is that
 * those two things are one command each. What it must never do is reach a
 * developer's real state, and there are exactly three ways it could:
 *
 * - **sharing a volume or a project name** with the self-host stack, so `up`
 *   re-seeds — destructively — a database somebody was keeping;
 * - **binding a port `bun dev` already holds**, which does not fail on CI and
 *   fails on the one machine that runs both;
 * - **interpolating a variable**, because compose reads the repo root's `.env`
 *   and that file holds a real `TOKEN_ENCRYPTION_KEY`.
 *
 * Facts are derived from wherever they already live: the published port from
 * `@mamen/shared/ports`, the image defaults from the Dockerfiles, the seeder's
 * refusal rule from `packages/api/src/demo/target.ts`, the two commands from the
 * root `package.json`. Restating any of them here would assert the compose file
 * against this test rather than against the app.
 *
 * Parsed rather than grepped, like `docker-compose.test.ts`, with which it
 * shares its reading of a compose file (`./compose-file.ts`): a `ports:` inside
 * a comment explaining why there is no `ports:` is the same bytes to a substring
 * search. Paths are cwd-relative — vitest runs from the package root.
 */

const DEMO_FILE = "docker-compose.demo.yml";
const PROD_FILE = "docker-compose.yml";

const demo = composeFile(DEMO_FILE);
const production = composeFile(PROD_FILE);

const { command, env, mounts, publishedPorts, service, services } = demo;

/** The root scripts, which are where the two documented commands live. */
const rootScripts = (): Record<string, string> =>
  JSON.parse(readRepoFile("package.json")).scripts as Record<string, string>;

/** The path the seeder is told to write, which is its last argument. */
const seedTarget = () => command("seed").split(/\s+/).at(-1) as string;

describe("the demo compose file", () => {
  it("exists at the repo root, where its build context is", () => {
    expect(existsSync(repoPath(DEMO_FILE))).toBe(true);
  });

  it("is the seeder plus the two containers the app is made of", () => {
    expect(Object.keys(services()).sort()).toStrictEqual(["api", "seed", "web"]);
  });

  it("builds both images from the repo root, as their Dockerfiles require", () => {
    for (const name of ["api", "web"]) {
      const build = service(name).build ?? {};

      expect(build.context, name).toBe(".");
      expect(build.dockerfile, name).toBe(`packages/${name}/Dockerfile`);
    }
  });

  it("runs the seeder on the api image rather than a second one", () => {
    // The seed script is `packages/api/scripts/seed-demo.ts`, which the api
    // image already carries: a build of its own would install the same
    // dependencies twice to run one file.
    expect(service("seed").build).toStrictEqual(service("api").build);
  });

  it("interpolates nothing, so the repo's own .env cannot reach it", () => {
    // Compose reads `.env` from the project directory for interpolation, and
    // this repo's root `.env` is the self-host operator's — a real
    // `TOKEN_ENCRYPTION_KEY` among other things. Every value here is a literal,
    // so the demo stack is the same stack on every machine and carries nothing
    // from the machine it is run on.
    expect(demo.text()).not.toMatch(/\$\{/);
  });

  it("names its own project, so it cannot be confused with any other stack", () => {
    // Without this the project name is the directory name — the same one the
    // self-host stack takes from the same checkout, which would make
    // `demo:down` reach that stack's containers.
    const name = demo.parsed().name ?? "";

    expect(name).toMatch(/demo/);
    expect(name).not.toBe(production.parsed().name ?? basename(process.cwd()));
  });

  it("keeps its data on a volume no other stack mounts", () => {
    const declared = demo.volumeNames();

    expect(declared).toHaveLength(1);
    expect(production.volumeNames()).not.toContain(declared[0]);

    // Named rather than a bind mount: a bind would write the demo database into
    // the working tree, where the next `docker compose down -v` cannot reach it
    // and `git status` can.
    for (const name of ["api", "seed"]) {
      const [mount, ...rest] = mounts(name);
      expect(rest, name).toStrictEqual([]);
      expect(mount?.source, name).toBe(declared[0]);
    }
  });

  it("restarts nothing, because the stack is meant to end", () => {
    // `unless-stopped`, which the self-host stack sets deliberately, would
    // bring a throwaway stack back after every reboot until somebody noticed.
    for (const name of Object.keys(services())) {
      expect(service(name).restart, name).toBeUndefined();
    }
  });
});

describe("the seed service", () => {
  it("runs the repo's own seeder, with the path it may write to", () => {
    const script = "packages/api/scripts/seed-demo.ts";

    expect(existsSync(repoPath(script))).toBe(true);
    expect(command("seed")).toContain(script);
  });

  it("seeds a file on the demo volume, and the api reads that same file", () => {
    const [mount] = mounts("seed");

    expect(seedTarget().startsWith(`${mount.target}/`)).toBe(true);
    expect(env("api").DB_PATH).toBe(seedTarget());
  });

  it("passes the seeder's own guard rather than forcing past it", () => {
    // `resolveSeedTarget` refuses a target whose file name is the API's
    // database (`DB_PATH`'s basename, and the api image bakes a default), so
    // that seeding cannot be aimed at a developer's own file. `--force` is the
    // way past it and has no business in a file that runs unattended: the demo
    // database simply has another name.
    const image = imageEnv("packages/api/Dockerfile");

    expect(basename(seedTarget())).not.toBe(basename(image.DB_PATH));
    expect(command("seed")).not.toContain("--force");
    expect(env("seed").DB_PATH).toBeUndefined();
  });

  it("finishes before the api starts, so the app never serves an empty database", () => {
    expect(service("api").depends_on).toStrictEqual({
      seed: { condition: "service_completed_successfully" },
    });
  });

  it("re-runs on every up, which is what makes two runs the same app", () => {
    // The seeder clears the tables it owns before writing them, so a volume
    // that survived a `down` is brought back to the same rows rather than
    // left wherever a screenshot session put it. Nothing here may skip it.
    expect(service("seed").restart).toBeUndefined();
    expect(command("seed")).not.toContain("||");
  });
});

describe("the api service", () => {
  it("publishes no host port, the reserved one included", () => {
    // 5401 is a registry reservation for reaching the demo API directly while
    // debugging the stack, not a default: published, it puts an unauthenticated
    // `POST /api/database/reset` on the host, exactly as the self-host stack's
    // api must not.
    expect(service("api").ports).toBeUndefined();
    expect(demo.text()).toContain(String(DEMO_STACK_API_PORT));
  });

  it("keeps the uploads beside the database, on the same mount", () => {
    const [mount] = mounts("api");
    const image = imageEnv("packages/api/Dockerfile");
    const uploads = env("api").UPLOADS_DIR ?? image.UPLOADS_DIR;

    expect(uploads.startsWith(`${mount.target}/`)).toBe(true);
  });

  it("carries no credential of any kind", () => {
    // The issue's rule, and it costs nothing: without an AI credential exactly
    // one import path degrades, and the UI says so. Nothing a screenshot shows
    // depends on one.
    for (const name of Object.keys(services())) {
      for (const [key, value] of Object.entries(env(name))) {
        expect(key, `${name}.${key}`).not.toMatch(/TOKEN|SECRET|PASSWORD|KEY|CREDENTIAL/i);
        expect(value, `${name}.${key}`).not.toMatch(/[0-9a-f]{32}/i);
      }
    }
  });

  it("sets every environment value as a mapping, never a pass-through", () => {
    // `environment: [TOKEN_ENCRYPTION_KEY]` — the list form with no value —
    // copies the variable out of the shell that ran `docker compose`, which is
    // the developer's shell. Every entry here has to state its own value.
    for (const name of Object.keys(services())) {
      const value = service(name).environment;
      expect(Array.isArray(value), name).toBe(false);
    }
  });
});

describe("the web service", () => {
  it("publishes the port the registry reserves for this stack", () => {
    const [published, ...rest] = publishedPorts("web");

    expect(rest).toStrictEqual([]);
    expect(published.host).toBe(String(DEMO_STACK_WEB_PORT));
    expect(published.container).toBe(exposedPort("packages/web/Dockerfile"));
  });

  it("takes a port no dev server and no other stack binds", () => {
    // The acceptance criterion that only fails on the machine it matters on:
    // the stack has to come up while `bun dev` is already running.
    const taken = [...portsOfKind("dev").map((row) => row.port), COMPOSE_STACK_WEB_PORT];

    expect(taken).not.toContain(DEMO_STACK_WEB_PORT);
  });

  it("points nginx at the api service on this stack's network", () => {
    expect(env("web").API_UPSTREAM).toBe(`api:${env("api").PORT}`);
  });

  it("starts after the api", () => {
    expect(service("web").depends_on).toContain("api");
  });
});

describe("the two documented commands", () => {
  it("bring the stack up with one script, building what it runs", () => {
    const up = rootScripts()["demo:up"] ?? "";

    expect(up).toContain(`-f ${DEMO_FILE}`);
    expect(up).toContain("--build");
  });

  it("take it down with one script, leaving nothing behind", () => {
    // The whole acceptance criterion: containers, volume and the images this
    // run built. `down` alone keeps the volume, so the next `up` would serve
    // whatever the last screenshot session left in it.
    const down = rootScripts()["demo:down"] ?? "";

    expect(down).toContain(`-f ${DEMO_FILE}`);
    expect(down).toMatch(/--volumes|\s-v\b/);
    expect(down).toContain("--rmi local");
  });

  it("are the commands the README tells a reader to run", () => {
    const readme = readRepoFile("README.md");

    for (const script of ["demo:up", "demo:down"]) {
      expect(readme).toContain(`bun run ${script}`);
    }
    expect(readme).toContain(`http://localhost:${DEMO_STACK_WEB_PORT}/app/`);
  });
});

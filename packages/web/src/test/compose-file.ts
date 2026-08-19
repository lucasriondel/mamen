import { readFileSync } from "node:fs";
import { parse } from "yaml";

/**
 * Reading a compose file, and the Dockerfiles it builds, as data.
 *
 * Two test files hold a compose file to the app it runs — `docker-compose.yml`
 * (the self-host stack, issue #140) and `docker-compose.demo.yml` (the
 * throwaway demo stack, issue #141) — and both need the same four things: the
 * parsed services, the mounts and published ports split into their halves, and
 * the `ENV`/`EXPOSE` defaults of the image behind each service. The assertions
 * are the part worth writing twice; the splitting is not.
 *
 * Parsed rather than grepped, which is the reason this is a module at all: a
 * `ports:` inside a comment explaining why there is no `ports:` is the same
 * bytes to a substring search, and both files carry exactly that comment.
 *
 * Not a `.test.ts` file, so vitest does not collect it — same as
 * `query-client-setup.tsx` beside it. Paths are cwd-relative: vitest runs from
 * the package root, so the repo root is `../..`.
 */

const ROOT = "../..";

/** A file at the repo root, or anywhere under it. */
export const readRepoFile = (path: string) => readFileSync(`${ROOT}/${path}`, "utf8");

/** Whether a file exists, for the tests that assert a path is real. */
export const repoPath = (path: string) => `${ROOT}/${path}`;

/** One service, in the shape the two stacks between them use. */
export type ComposeService = {
  build?: { context?: string; dockerfile?: string; args?: unknown };
  command?: string[] | string;
  environment?: Record<string, string | number | null> | string[];
  ports?: string[];
  volumes?: string[];
  depends_on?: string[] | Record<string, { condition?: string }>;
  restart?: string;
};

export type ComposeDocument = {
  name?: string;
  services?: Record<string, ComposeService>;
  volumes?: Record<string, unknown>;
};

/** A `SOURCE:TARGET` volume entry, split. */
export type Mount = { source: string; target: string };

/** A `HOST:CONTAINER` port entry, split. */
export type Publication = { host: string; container: string };

/**
 * A compose file's accessors, re-reading the file on each call so a test that
 * edits nothing still cannot be fooled by a stale parse.
 */
export type ComposeFile = {
  /** The raw text, for the assertions whose subject is what is written. */
  text: () => string;
  parsed: () => ComposeDocument;
  services: () => Record<string, ComposeService>;
  service: (name: string) => ComposeService;
  /** `KEY: value` environment, as strings. The list form parses to `{}`. */
  env: (name: string) => Record<string, string>;
  /** The service's `command:`, whichever form it is written in, as one string. */
  command: (name: string) => string;
  mounts: (name: string) => Mount[];
  publishedPorts: (name: string) => Publication[];
  volumeNames: () => string[];
};

export function composeFile(path: string): ComposeFile {
  const text = () => readRepoFile(path);
  const parsed = (): ComposeDocument => parse(text());
  const services = () => parsed().services ?? {};
  const service = (name: string): ComposeService => services()[name] ?? {};

  return {
    text,
    parsed,
    services,
    service,
    env: (name) =>
      Object.fromEntries(
        Object.entries((service(name).environment ?? {}) as Record<string, unknown>).map(
          ([key, value]) => [key, String(value ?? "")],
        ),
      ),
    command: (name) => {
      const value = service(name).command;
      return Array.isArray(value) ? value.join(" ") : (value ?? "");
    },
    mounts: (name) =>
      (service(name).volumes ?? []).map((entry) => {
        const [source, target] = entry.split(":");
        return { source, target };
      }),
    // Split at the *last* colon: a host side may be an interpolation,
    // `${WEB_PORT:-5402}`, which carries one of its own.
    publishedPorts: (name) =>
      (service(name).ports ?? []).map((entry) => {
        const [, host, container] = entry.split("/")[0].match(/^(.*):(\d+)$/) as RegExpMatchArray;
        return { host, container };
      }),
    volumeNames: () => Object.keys(parsed().volumes ?? {}),
  };
}

/** `ENV NAME=value` defaults baked into an image. */
export function imageEnv(dockerfile: string): Record<string, string> {
  const out: Record<string, string> = {};

  for (const [, name, value] of readRepoFile(dockerfile).matchAll(
    /^(?:ENV\s+|\t)([A-Z_][A-Z0-9_]*)=(\S+)/gm,
  )) {
    out[name as string] = value as string;
  }

  return out;
}

/** The port an image says it listens on. */
export const exposedPort = (dockerfile: string) =>
  readRepoFile(dockerfile).match(/^EXPOSE\s+(\d+)/m)?.[1] as string;

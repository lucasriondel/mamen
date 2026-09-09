import { readdirSync, readFileSync } from "node:fs";
import { APP_BASE_PATH } from "@mamen/shared/app-base-path";
import { describe, expect, it } from "vitest";
import {
  ACCESS_APPLICATION,
  API_PATH,
  containerFor,
  DEFAULT_SITE_HOST,
  isBehindAccess,
  ROUTES,
  SITE_HOST,
  SITE_ROOT,
  siteHost,
  siteUrl,
  UPLOADS_PATH,
} from "./topology";

/**
 * The deployed topology, held to the two things that break in production rather
 * than in a build (issue #114).
 *
 * The first is the app's prefix: four layers repeat it and only the JavaScript
 * ones can import it, so a route table that spells `/app` by hand is a fifth
 * copy — and the one that decides which container a request reaches.
 *
 * The second is the Access boundary. It is written next to the routing because
 * the failure mode is the mismatch between them: a path the web container
 * answers but Access does not cover is the whole database open to the
 * internet, and a landing path Access *does* cover is a public page behind a
 * login prompt. Both are one assertion each, below.
 *
 * Paths are cwd-relative — vitest runs from the package root.
 */

const read = (path: string) => readFileSync(path, "utf8");

/**
 * Every file a build reads: the config, and each source that is not a test or
 * the topology module itself. These are the files a host name would reach a
 * built page through.
 */
const BUILT = [
  "vite.config.ts",
  ...readdirSync("src", { recursive: true, encoding: "utf8" })
    .filter((entry) => /\.tsx?$/.test(entry) && !entry.endsWith(".test.ts"))
    .map((entry) => `src/${entry}`),
].filter((file) => file !== "src/topology.ts");

const paths = ROUTES.map((route) => route.path);
const webPaths = ROUTES.filter((r) => r.container === "web").map((r) => r.path);

describe("the path split", () => {
  it("declares every path once, rooted", () => {
    expect(paths.length).toBeGreaterThan(1);
    expect(new Set(paths).size).toBe(paths.length);
    for (const path of paths) expect(path.startsWith("/")).toBe(true);
  });

  it("gives the site root to the landing container", () => {
    const root = ROUTES.filter((route) => route.path === SITE_ROOT);

    expect(root).toHaveLength(1);
    expect(root[0]?.container).toBe("landing-page");
  });

  it("gives the app the prefix the Vite base and the router read", () => {
    // #109's constant, not a fifth copy of the literal: this table decides
    // which container a request reaches, so a drift here routes the app's
    // deep links at the landing page's 404.
    const app = ROUTES.find((route) => route.path === APP_BASE_PATH);

    expect(app?.container).toBe("web");
    expect(read("src/topology.ts")).not.toContain(`"${APP_BASE_PATH}"`);
  });

  it("routes the API and the uploads to the web container", () => {
    // The one routing mistake that reads as "the app is broken" rather than
    // "the route is wrong": the landing container proxies nothing, so those
    // two paths reach the API only through the web container's nginx.
    for (const path of [API_PATH, UPLOADS_PATH]) {
      expect(ROUTES.find((route) => route.path === path)?.container).toBe("web");
    }
  });

  it("keeps the API at the root, outside the app prefix", () => {
    // Moving it under the prefix is not cosmetic: the SDK calls its API
    // same-origin and nothing in this stack emits a CORS header, so a
    // cross-origin call dies on a preflight Access answers without one.
    expect(API_PATH.startsWith(`${APP_BASE_PATH}/`)).toBe(false);

    const contract = read("../shared/src/contract/api.ts").match(/\.prefix\("([^"]+)"\)/)?.[1];
    expect(contract).toBe(API_PATH);
  });

  it("resolves a request to the container that answers it", () => {
    expect(containerFor(SITE_ROOT)).toBe("landing-page");
    expect(containerFor(`${APP_BASE_PATH}/transactions`)).toBe("web");
    expect(containerFor(`${API_PATH}/health`)).toBe("web");
    expect(containerFor(`${UPLOADS_PATH}/issuers/7.webp`)).toBe("web");
  });

  it("does not hand the app's container a root path that starts like its prefix", () => {
    // `/apple-touch-icon.png` begins with the four bytes of the prefix and
    // belongs to the landing page; the web container's nginx location is
    // slashed for the same reason.
    expect(containerFor("/apple-touch-icon.png")).toBe("landing-page");
    expect(containerFor("/favicon.ico")).toBe("landing-page");
  });
});

describe("the Cloudflare Access boundary", () => {
  it("covers exactly the paths the web container answers", () => {
    expect([...ACCESS_APPLICATION.paths].sort()).toStrictEqual([...webPaths].sort());
  });

  it("leaves every landing path public", () => {
    // Gating the root defeats the point of having a landing page at all: a
    // logged-out visitor must get the page, not a login prompt.
    for (const route of ROUTES) {
      if (route.container === "landing-page") {
        expect(isBehindAccess(route.path)).toBe(false);
      }
    }
    expect(isBehindAccess(SITE_ROOT)).toBe(false);
    expect(isBehindAccess("/apple-touch-icon.png")).toBe(false);
  });

  it("gates a deep link, an API call and an uploaded image alike", () => {
    expect(isBehindAccess(APP_BASE_PATH)).toBe(true);
    expect(isBehindAccess(`${APP_BASE_PATH}/transactions`)).toBe(true);
    expect(isBehindAccess(`${API_PATH}/health`)).toBe(true);
    expect(isBehindAccess(`${UPLOADS_PATH}/issuers/7.webp`)).toBe(true);
  });

  it("is one application, so one cookie covers the app and its API", () => {
    // Two applications on the same host issue two audiences: the SPA would
    // authenticate at the app prefix and then have its same-origin fetch of
    // /api answered with a login redirect, which arrives at the SDK as HTML.
    expect(ACCESS_APPLICATION.paths).toContain(APP_BASE_PATH);
    expect(ACCESS_APPLICATION.paths).toContain(API_PATH);
    expect(ACCESS_APPLICATION.host).toBe(SITE_HOST);
  });
});

describe("the site host", () => {
  it("defaults to the maintainer's host, so an unset deployment keeps working", () => {
    expect(siteHost({})).toBe(DEFAULT_SITE_HOST);
    expect(DEFAULT_SITE_HOST).toMatch(/^[a-z0-9.-]+\.[a-z]{2,}$/);
  });

  it("is configuration: another install substitutes its own", () => {
    expect(siteHost({ SITE_HOST: "money.example.com" })).toBe("money.example.com");
    // An empty value is an unset one — a Dokploy field left blank must not
    // produce `https:///app/`.
    expect(siteHost({ SITE_HOST: "  " })).toBe(DEFAULT_SITE_HOST);
  });

  it("builds absolute URLs for the paths this table already names", () => {
    expect(siteUrl(SITE_ROOT)).toBe(`https://${SITE_HOST}/`);
    expect(siteUrl(`${APP_BASE_PATH}/`)).toBe(`https://${SITE_HOST}${APP_BASE_PATH}/`);
  });
});

describe("the topology module", () => {
  it("is data, not runtime code: nothing that ships imports it", () => {
    // It reads `process.env` and names a host. Either would be a build-time
    // value baked into a page that deliberately has no JavaScript at all.
    //
    // Every non-test source, not the three files that existed when this was
    // written: the renderer changed name and extension at the contract step
    // (issue #148), and a list naming `src/page.ts` would have gone quiet
    // rather than red the day it did.
    expect(BUILT.length).toBeGreaterThan(2);

    for (const file of BUILT) {
      expect(read(file), `${file} reads the topology`).not.toContain("topology");
    }
  });

  it("keeps the host out of the page", () => {
    for (const file of BUILT) {
      expect(read(file), `${file} names the host`).not.toContain(DEFAULT_SITE_HOST);
    }
  });
});

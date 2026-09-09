import { readFileSync } from "node:fs";
import { APP_BASE_PATH } from "@mamen/shared";
import { describe, expect, it } from "vitest";
import { router } from "./router";

/**
 * The router's half of serving the SPA under a path prefix (issue #111). Route
 * files stay written from `/` — the prefix is applied once, here — so what has
 * to hold is that every href the router builds carries it and nothing else
 * does.
 *
 * The app's own router instance is under test, not a stand-in built from the
 * same constant: a stand-in would pass with `basepath` missing from
 * `router.ts`. It is built, never mounted; `buildLocation` needs a location to
 * resolve `from` against, which jsdom's `window.location` supplies.
 *
 * The rest of the adoption — the Vite `base`, nginx, the image — lives in
 * `src/test/app-base-path-adoption.test.ts`, which needs the node environment.
 */

describe("the app router", () => {
  it("resolves client-side routes under the prefix", () => {
    expect(router.basepath).toBe(APP_BASE_PATH);
    expect(router.buildLocation({ to: "/accounts" }).href).toBe(`${APP_BASE_PATH}/accounts`);
  });

  it("prefixes a deep link, params and search alike", () => {
    const location = router.buildLocation({
      to: "/transactions/$transactionId",
      params: { transactionId: 42 },
      search: { from: "recap" },
    });
    expect(location.href).toBe(`${APP_BASE_PATH}/transactions/42?from=recap`);
  });

  it("does not prefix the API, which stays at the root", () => {
    // The SDK builds its own same-origin `/api` URLs and never goes through
    // the router; this is here because a `basepath` that leaked into fetch
    // would be invisible until a request 404'd in the browser.
    expect(`${APP_BASE_PATH}/accounts`).not.toContain("/api");
  });

  it("reads the prefix from the shared constant, not a local literal", () => {
    const source = readFileSync("src/router.ts", "utf8");
    expect(source).toMatch(/APP_BASE_PATH\b/);
    expect(source).not.toContain(`"${APP_BASE_PATH}"`);
  });

  it("is the router `main.tsx` mounts", () => {
    // Building it here rather than in the entrypoint is what makes the
    // assertions above possible; a second `createRouter` in `main.tsx` would
    // be the one that actually ships.
    const main = readFileSync("src/main.tsx", "utf8");
    expect(main).toMatch(/from "\.\/router"/);
    expect(main).not.toMatch(/\bcreateRouter\b/);
  });
});

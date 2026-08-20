import { APP_BASE_PATH } from "@mamen/shared/app-base-path";
import { LANDING_PAGE_DEV_PORT, PORT_TAKEN_ELSEWHERE } from "@mamen/shared/ports";
import type { Plugin, UserConfig } from "vite";
import { describe, expect, it } from "vitest";
import viteConfig from "../vite.config";

/**
 * The landing site's build, from the config that ships it.
 *
 * Two facts matter beyond the port. It builds for the **root** — this package
 * is the one thing on the deployed domain that is not under `/app`, and a
 * `base` of anything else would emit asset URLs into the app's territory. And
 * it prerenders through the plugin: the config is where a page that renders in
 * the browser would creep back in.
 */

const config = viteConfig as UserConfig;
const plugins = (config.plugins ?? []).flat() as Plugin[];

describe("the landing build", () => {
  it("pins the dev server to its registered port, and refuses to drift off it", () => {
    // `strictPort` is the point of the pin: without it Vite hunts for a
    // free port and the registry's row becomes a suggestion — and the next
    // free port is somebody else's row. The number is the registry's
    // (`@mamen/shared/ports`), not this package's to choose.
    expect(config.server?.port).toBe(LANDING_PAGE_DEV_PORT);
    expect(config.server?.strictPort).toBe(true);
  });

  it("is off the port the registry gives another app (issue #137)", () => {
    // It was pinned there, so whichever of the two apps started second
    // failed to boot. This is the assertion that keeps it moved.
    expect(config.server?.port).not.toBe(PORT_TAKEN_ELSEWHERE);
  });

  it("builds for the site root, not for the app's prefix", () => {
    expect(config.base ?? "/").toBe("/");
    expect((config.base ?? "/").startsWith(APP_BASE_PATH)).toBe(false);
  });

  it("prerenders the page", () => {
    expect(plugins.map((p) => p.name)).toContain("mamen:prerender-landing-page");
  });

  it("takes no framework plugin, with React in the package", () => {
    // React is here (issues #145, #148) and runs in Node, through the
    // prerender hook. A framework plugin's job is the opposite one — a client
    // entry, a refresh runtime, a bundle for a browser — and taking one is how
    // this page would quietly acquire the script tag it exists without.
    expect(plugins.map((p) => p.name)).toStrictEqual(["mamen:prerender-landing-page"]);
  });

  it("serves unknown paths the way nginx does: not by falling back to the page", () => {
    // Vite's default treats a project as a single-page app and answers every
    // unknown path with `index.html`; `nginx.conf` answers `=404`. A dev
    // server that disagreed would show a deleted route still working.
    expect(config.appType).toBe("mpa");
  });

  it("proxies nothing", () => {
    // The app's nginx proxies `/api` and `/uploads`; this container serves
    // static files and nothing else. A proxy here would be a second, silent
    // route to the API.
    expect(config.server?.proxy).toBeUndefined();
  });
});

import { APP_BASE_PATH } from "@mamen/shared/app-base-path";
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
	it("pins the dev server to 5100, and refuses to drift off it", () => {
		// `strictPort` is the point of the pin: without it Vite hunts for a free
		// port and the row in PORTS.md becomes a suggestion. 5100 is the perso
		// frontend range's next free slot (5090 and 5200 are taken).
		expect(config.server?.port).toBe(5100);
		expect(config.server?.strictPort).toBe(true);
	});

	it("builds for the site root, not for the app's prefix", () => {
		expect(config.base ?? "/").toBe("/");
		expect((config.base ?? "/").startsWith(APP_BASE_PATH)).toBe(false);
	});

	it("prerenders the page", () => {
		expect(plugins.map((p) => p.name)).toContain(
			"mamen:prerender-landing-page",
		);
	});

	it("proxies nothing", () => {
		// The app's nginx proxies `/api` and `/uploads`; this container serves
		// static files and nothing else. A proxy here would be a second, silent
		// route to the API.
		expect(config.server?.proxy).toBeUndefined();
	});
});

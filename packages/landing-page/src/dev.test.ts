import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { afterAll, describe, expect, it } from "vitest";
import { renderPage } from "./page";

/**
 * The site root, from the dev server that serves it (issues #145, #148).
 *
 * `build.test.ts` proves what is in `dist`; this proves what a developer gets
 * while working on it. The two are not the same claim — a build resolves
 * entries by file name and a dev server resolves them by URL, which is exactly
 * where a swap that moved only one of the two would show up. So this suite
 * makes a real HTTP request rather than calling the plugin's hook: the hook
 * returning the right string is what `prerender.test.ts` already asserts, and it
 * would keep asserting it while a browser at `/` got something else.
 *
 * The port is **not** the registry's pinned one (`@mamen/shared/ports`). A test
 * that bound it would fail whenever the developer running it had `bun dev` up —
 * which is precisely when someone is most likely to run this. `strictPort` is
 * off for the same reason, and this override is the only place in the package
 * that is allowed to disagree with the config about the port.
 *
 * `host` is pinned to IPv4 because Vite's default resolves to `::1` here and
 * `fetch` does not fall back to it, and `root` is passed because a dev server
 * takes it from the working directory — `configFile` says where the config is
 * read from, not what it serves.
 */

const server = await createServer({
  configFile: fileURLToPath(new URL("../vite.config.ts", import.meta.url)),
  root: fileURLToPath(new URL("../", import.meta.url)),
  logLevel: "silent",
  server: { host: "127.0.0.1", port: 0, strictPort: false },
});

await server.listen();

afterAll(() => server.close());

// The URL the server actually bound, not the one it was asked for: `port: 0`
// means the OS chooses, and `config.server.port` still reads back the request.
// Cast away the `undefined` and every request below fails on a URL that reads
// `undefined/`, which names the wrong thing; say what went wrong here.
const [local] = server.resolvedUrls?.local ?? [];
if (local === undefined) throw new Error("the dev server bound no local URL");

const origin = local.replace(/\/$/, "");

const get = (path: string) => fetch(`${origin}${path}`);

/**
 * A served document, comparable to the one the renderer returns.
 *
 * The dev server injects its HMR client, which no renderer wrote and no build
 * emits, so it comes back out — and with it the indentation it arrived in,
 * which is why the space *between tags* goes too. That is the only thing the
 * injection disturbs.
 */
const document = (html: string) =>
  html
    .replace(/<script type="module" src="\/@vite\/client"><\/script>/, "")
    .replace(/\s+/g, " ")
    .replace(/>\s+</g, "><")
    .trim();

describe("the dev server", () => {
  it("serves the React renderer's document at the site root", async () => {
    // Equality, not a text match: the string renderer said the same words as
    // this one, so anything looser passed while either was being served.
    const response = await get("/");
    expect(response.status).toBe(200);
    expect(document(await response.text())).toBe(document(await renderPage()));
  });

  it("no longer answers at the route the React page arrived on", async () => {
    // The temporary route was a second HTML entry, not an nginx rule, so the
    // way to see it gone is to ask for it. A dev server that still resolved it
    // would mean the entry outlived the string renderer it stood beside.
    expect((await get("/preview/")).status).toBe(404);
  });
}, 60_000);

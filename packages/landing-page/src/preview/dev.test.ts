import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { afterAll, describe, expect, it } from "vitest";
import { renderPage } from "../page";
import { renderPreviewPage } from "./render";
import { PREVIEW_ROUTE } from "./route";

/**
 * The preview route, from the dev server that serves it (issue #145).
 *
 * `build.test.ts` proves the route is in `dist`; this proves it is reachable
 * while someone is working on it. The two are not the same claim — a build
 * resolves entries by file name and a dev server resolves them by URL, which is
 * exactly where a dispatch on the wrong one of the two would show up. So this
 * suite makes a real HTTP request rather than calling the plugin's hook: the
 * hook returning the right string is what `build.test.ts` already asserts, and
 * it would keep asserting it while a browser at `/preview/` got the root page.
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
  configFile: fileURLToPath(new URL("../../vite.config.ts", import.meta.url)),
  root: fileURLToPath(new URL("../../", import.meta.url)),
  logLevel: "silent",
  server: { host: "127.0.0.1", port: 0, strictPort: false },
});

await server.listen();

afterAll(() => server.close());

// The URL the server actually bound, not the one it was asked for: `port: 0`
// means the OS chooses, and `config.server.port` still reads back the request.
const origin = (server.resolvedUrls?.local[0] as string).replace(/\/$/, "");

const get = async (path: string) => {
  const response = await fetch(`${origin}${path}`);
  expect(response.status).toBe(200);
  return await response.text();
};

/**
 * A served document, comparable to the one a renderer returns.
 *
 * The dev server injects its HMR client, which no renderer wrote and no build
 * emits, so it comes back out — and with it the indentation it arrived in,
 * which is why the space *between tags* goes too. That is the only thing the
 * injection disturbs, and it disturbs it identically for both renderers, so
 * each is still compared against its own output rather than against a
 * normalised idea of the page.
 *
 * Layout is safe to spend here: the two renderers differ in their markup, not
 * only in their whitespace, so a root page served at `/preview/` still fails.
 */
const document = (html: string) =>
  html
    .replace(/<script type="module" src="\/@vite\/client"><\/script>/, "")
    .replace(/\s+/g, " ")
    .replace(/>\s+</g, "><")
    .trim();

describe("the dev server", () => {
  it("serves the React renderer's document at the preview route", async () => {
    // Equality, not a text match: both pages say the same words, so anything
    // looser passes while the root page is being served at this route.
    expect(document(await get(PREVIEW_ROUTE))).toBe(document(await renderPreviewPage()));
  });

  it("still serves the string page at the root", async () => {
    // The expand step's promise, made where a developer would first notice it
    // broken: the root is untouched while the second renderer stands beside it.
    expect(document(await get("/"))).toBe(document(renderPage()));
  });
}, 60_000);

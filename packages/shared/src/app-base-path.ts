/**
 * The path prefix the SPA is served under.
 *
 * The deployed site keeps its root for the public landing pages, so the app
 * itself lives one level down. Three layers have to agree on that prefix:
 *
 * - the Vite build (`base`), so emitted asset URLs carry it;
 * - the TanStack Router (`basepath`), so client-side routes resolve under it;
 * - the nginx single-page fallback (`packages/web/nginx.conf.template`).
 *
 * The first two are JavaScript and can import this constant; nginx is not, so
 * its template repeats the literal and points back here — the one copy this
 * constant cannot remove.
 *
 * `/api` and `/uploads` deliberately do NOT move under the prefix. They stay
 * at the root, proxied by the same nginx, for two reasons that both have to
 * hold:
 *
 * - The contract pins `/api` (`src/contract/api.ts`), and the server, the
 *   derived client and the emitted OpenAPI all read it from there.
 * - The app must keep calling its API **same-origin**. Nothing in this stack
 *   emits a CORS header — the SDK falls back to a same-origin base
 *   (`sdk/src/runtime.ts`) precisely so none is needed. Route the API
 *   anywhere that makes the call cross-origin and the browser preflights it;
 *   behind Cloudflare Access the preflight is answered by Access itself, with
 *   no CORS headers on the response, and the request fails before the API
 *   ever sees it.
 *
 * Nothing reads this yet. Adopting it across the three layers is a single
 * slice (issue #111) because a half-prefixed app does not serve.
 */
export const APP_BASE_PATH = "/app";

/**
 * `APP_BASE_PATH` in the form Vite's `base` is documented in — a directory
 * URL, `/foo/`, which is also the shape its dev-server path handling strips
 * against. A router `basepath` and an nginx `location` are written unslashed.
 * Both spellings are published here so no consumer trims or appends its own;
 * this one is derived from the other rather than restated. A `const` template
 * literal over a literal keeps the literal type, so no `as const` is needed
 * and neither export widens to `string`.
 */
export const APP_BASE_PATH_SLASH = `${APP_BASE_PATH}/`;

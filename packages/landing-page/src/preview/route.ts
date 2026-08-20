/**
 * Where the React renderer answers while it stands beside the old one.
 *
 * A **temporary route** (issue #145): the expand step adds the new renderer
 * without taking anything away, so the site root keeps serving `src/page.ts`
 * and the React page gets a prefix of its own. The contract step moves it to
 * `/` and this module goes with it.
 *
 * It holds nothing but the two spellings of that prefix, and it imports
 * nothing, so `vite.config.ts` and `src/prerender.ts` can read it without
 * pulling React into the config's own module graph.
 */

/** The URL prefix the preview page is served at, in dev and in `dist` alike. */
export const PREVIEW_ROUTE = "/preview/";

/**
 * The HTML entry Vite builds it from, relative to the package root — a stub,
 * like `index.html`, that the prerender plugin replaces wholesale. The path is
 * derived from the route rather than written again: `dist/preview/index.html`
 * is what nginx resolves `/preview/` to, and the two must not drift.
 */
export const PREVIEW_ENTRY = `${PREVIEW_ROUTE.slice(1)}index.html`;

/** Whether an HTML transform's path belongs to the preview entry. */
export const isPreviewPath = (path: string): boolean => path.startsWith(PREVIEW_ROUTE);

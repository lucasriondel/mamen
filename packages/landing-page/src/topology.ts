import { APP_BASE_PATH } from "@mamen/shared/app-base-path";

/**
 * The deployed topology, written down once as data (issue #114).
 *
 * One domain, split by path across two nginx containers and an API that is not
 * publicly routed at all. Three separate things repeat that split — the reverse
 * proxy's domain entries, the two nginx configs, and `DEPLOY.md` — and none of
 * them can be derived from the others, so this module is the copy the tests
 * hold them to.
 *
 * **It is not runtime code.** Nothing in `src/page.ts` or the build imports it:
 * the page ships as HTML with no JavaScript at all, and a host name baked into
 * it would be exactly the thing this module exists to keep out of source. Its
 * consumers are `topology.test.ts`, `deploy-doc.test.ts`, and a reader.
 *
 * It lives in this package rather than in `@mamen/shared` because the site
 * root is what this package owns: the split is the answer to "what does the
 * landing container serve", and the rest of the table is the same answer read
 * the other way round.
 */

/** The two nginx containers a public request can land in. */
export type ContainerName = "landing-page" | "web";

export type Route = {
	/** The path prefix, as the reverse proxy matches it. */
	readonly path: string;
	/** The container the reverse proxy sends it to. */
	readonly container: ContainerName;
	/** What comes back, in the words `DEPLOY.md`'s routing table uses. */
	readonly serves: string;
};

/** The site root — everything not claimed by a longer prefix below. */
export const SITE_ROOT = "/";

/**
 * The API's prefix. Pinned by the contract (`shared/src/contract/api.ts`) for
 * the server, the derived client and the emitted OpenAPI alike, and kept at the
 * root rather than under the app's prefix so the SPA's calls stay same-origin.
 */
export const API_PATH = "/api";

/** Issuer images, served off the API's uploads volume. */
export const UPLOADS_PATH = "/uploads";

/**
 * Which prefix goes to which container. Longest match wins, which is both what
 * Traefik does with `PathPrefix` rules of different lengths and what
 * `containerFor` implements below.
 */
export const ROUTES: readonly Route[] = [
	{
		path: SITE_ROOT,
		container: "landing-page",
		serves: "the prerendered landing page; an unknown path is a 404",
	},
	{
		path: APP_BASE_PATH,
		container: "web",
		serves: "the SPA shell, with `try_files` falling back to it for deep links",
	},
	{
		path: API_PATH,
		container: "web",
		serves: "proxied to the API container over the internal Docker network",
	},
	{
		path: UPLOADS_PATH,
		container: "web",
		serves: "proxied to the API container, off its data volume",
	},
];

/**
 * The maintainer's host. This install's, not the only one mamen runs on — the
 * value is the default rather than a literal in the tables so a second
 * deployment substitutes its own with an environment variable instead of a
 * patch.
 */
export const DEFAULT_SITE_HOST = "mamen.gousse.cool";

/**
 * The public host, from `SITE_HOST` when it is set to something. A blank value
 * is an unset one — a deployment field left empty otherwise produces
 * `https:///app/`, which is a URL nothing can follow and nothing warns about.
 */
export function siteHost(
	env: Record<string, string | undefined> = process.env,
): string {
	return env.SITE_HOST?.trim() || DEFAULT_SITE_HOST;
}

/** The configured host, resolved once at import. */
export const SITE_HOST: string = siteHost();

/** An absolute URL on the site, for the paths this table already names. */
export const siteUrl = (path: string): string => `https://${SITE_HOST}${path}`;

/**
 * The Cloudflare Access application in front of the host.
 *
 * **One application, three paths** — not three applications. Access issues its
 * cookie per application, so splitting the app prefix and `/api` in two means a
 * browser authenticated for the app gets a login redirect on its first
 * same-origin `fetch("/api/…")`, which reaches the SDK as an HTML document
 * where JSON was expected. One application, one audience, one cookie.
 *
 * The site root is deliberately absent: it is the public landing page, and
 * gating it defeats the point of having one. That is the assertion
 * `topology.test.ts` spends a test on in both directions — every path the web
 * container answers is covered, and no path the landing container answers is.
 */
export const ACCESS_APPLICATION: {
	readonly name: string;
	readonly host: string;
	readonly paths: readonly string[];
} = {
	name: "mamen",
	host: SITE_HOST,
	paths: [APP_BASE_PATH, API_PATH, UPLOADS_PATH],
};

/** Whether `path` falls under `prefix`, by whole segments. */
const under = (prefix: string, path: string): boolean =>
	prefix === SITE_ROOT || path === prefix || path.startsWith(`${prefix}/`);

/**
 * The container that answers `path`, by longest matching prefix. Segment-aware:
 * `/apple-touch-icon.png` is not under `/app`, which is why the web container's
 * nginx `location` is slashed and its bare prefix gets an exact match instead.
 */
export function containerFor(path: string): ContainerName {
	const match = [...ROUTES]
		.filter((route) => under(route.path, path))
		.sort((a, b) => b.path.length - a.path.length)[0];

	return match?.container ?? "landing-page";
}

/**
 * Whether a request for `path` meets the Access login. Modelled the way
 * Cloudflare matches an application path — the path itself and everything under
 * it — so the two boundaries in this module are compared as behaviour rather
 * than as two spellings of the same list.
 */
export const isBehindAccess = (path: string): boolean =>
	ACCESS_APPLICATION.paths.some((prefix) => under(prefix, path));

/**
 * Every port mamen binds, written down once as data (issue #137).
 *
 * The machine's registry is `~/dev/PORTS.md` — one file for every app on this
 * developer's box, and the reason two projects do not silently fight over a
 * number. This module is **mamen's rows of it**, in the repo, so the configs
 * that bind them can import the value instead of restating it and a reader can
 * see the whole set at once. The registry stays canonical for the *machine*:
 * a port taken here is only taken once its row is appended there, because
 * nothing in this repo can see the other apps.
 *
 * The registry's conventions, which the numbers below follow:
 *
 * - perso frontends live in the **5xxx** range;
 * - Docker host ports are allocated **bottom-up from 5400**, with no gap — the
 *   next stack takes the first free number, which is what makes it derivable;
 * - anything Vite serves is pinned with **`strictPort`**, so a taken port is a
 *   failure to boot rather than a silent hop to the next free one — a hop
 *   would make the registry's row a suggestion.
 *
 * **The landing page moved off 5100.** It was pinned there against a row the
 * registry gives a different app, so whichever of the two started second failed
 * to boot. 5080 is the free slot between mamen's web dev server (5070) and the
 * next taken row (5090), which also puts mamen's two frontends beside each
 * other. Moving mamen was the cheap half of the fix: this repo can change its
 * own callers, and cannot change another app's.
 *
 * **Import-free**, like `./app-base-path`: `vite.config.ts` loads before any
 * app code and must not drag `effect` in behind a number.
 */

/** What kind of thing binds a port, which is also what decides its range. */
export type PortKind =
	/** A dev server on the host — `bun dev` starts it. */
	| "dev"
	/** A container's published host port, allocated from 5400 up. */
	| "docker";

/** One row of the registry, as it applies to mamen. */
export type PortRow = {
	/** The number bound on the host. */
	readonly port: number;
	/** What binds it. */
	readonly service: string;
	/** Which range it is allocated from. */
	readonly kind: PortKind;
	/** What answers there, in the words the docs' table uses. */
	readonly serves: string;
};

/** The SPA's Vite dev server. */
export const WEB_DEV_PORT = 5070;

/**
 * The public site's Vite dev server. Was 5100 until issue #137 — see the
 * module docs for why it moved.
 */
export const LANDING_PAGE_DEV_PORT = 5080;

/** The API's Bun server, and its `PORT` default. */
export const API_DEV_PORT = 5500;

/**
 * The throwaway demo stack's web container (issue #141): the app served over
 * the seeded demo database, for screenshots. Reserved here rather than picked
 * in the compose file, because the stack has to come up while `bun dev` is
 * already running.
 */
export const DEMO_STACK_WEB_PORT = 5400;

/**
 * The demo stack's API container. Reserved, not published by default: the web
 * container proxies `/api` over the internal network, so this is only for
 * reaching the demo API directly while debugging the stack. A reservation
 * costs nothing; a port picked ad hoc later costs the next project on this box.
 */
export const DEMO_STACK_API_PORT = 5401;

/**
 * The self-hosted Compose stack's web container (issue #140): the app itself,
 * on one host, `docker compose up --build`. The **only** port that stack
 * publishes — its api is reachable through the web container's nginx and
 * nowhere else — so there is no second row for it.
 *
 * Nothing stands in front of this port: no Traefik, no Cloudflare Access, and
 * the app has no authentication of its own. Whoever can reach it can use the
 * whole database, which is why DEPLOY.md's Compose section says so before it
 * says anything else.
 */
export const COMPOSE_STACK_WEB_PORT = 5402;

/** The lowest host port a Docker row may take, by registry convention. */
export const DOCKER_HOST_PORT_FLOOR = 5400;

/** The port the registry gives another app — mamen may not bind it. */
export const PORT_TAKEN_ELSEWHERE = 5100;

/**
 * Mamen's rows, in the order the docs' table lists them: what `bun dev` binds,
 * then what a container publishes.
 */
export const PORTS: readonly PortRow[] = [
	{
		port: WEB_DEV_PORT,
		service: "web dev server",
		kind: "dev",
		serves: "the SPA under its path prefix, proxying `/api` and `/uploads`",
	},
	{
		port: LANDING_PAGE_DEV_PORT,
		service: "landing-page dev server",
		kind: "dev",
		serves: "the public page the deployed site serves at its root",
	},
	{
		port: API_DEV_PORT,
		service: "API",
		kind: "dev",
		serves: "the HTTP API, its Scalar docs and the emitted OpenAPI spec",
	},
	{
		port: DEMO_STACK_WEB_PORT,
		service: "demo stack web container",
		kind: "docker",
		serves: "the app over the seeded demo database, for screenshots",
	},
	{
		port: DEMO_STACK_API_PORT,
		service: "demo stack API container",
		kind: "docker",
		serves: "the demo API directly; published only while debugging the stack",
	},
	{
		port: COMPOSE_STACK_WEB_PORT,
		service: "self-host compose stack",
		kind: "docker",
		serves: "the app and, proxied through it, the API — `WEB_PORT` moves it",
	},
];

/** The rows of one kind, for a doc table or a range assertion. */
export const portsOfKind = (kind: PortKind): readonly PortRow[] =>
	PORTS.filter((row) => row.kind === kind);

import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
	ACCESS_APPLICATION,
	isBehindAccess,
	ROUTES,
	type Route,
	SITE_HOST,
	siteUrl,
} from "./topology";

/**
 * `DEPLOY.md` against the topology it documents (issue #114).
 *
 * The document is the thing a reader acts on, and it is also the thing that
 * silently rots: a route added to the reverse proxy and not to the table reads
 * as "that path is not deployed", and a path gated in Cloudflare but written
 * here as public reads as "the landing page is up" while a visitor gets a login
 * form. So the rows are *derived* from `topology.ts` and matched against the
 * file, rather than restated by hand here — a second copy of the table in a test
 * would assert the document against itself.
 *
 * Paths are cwd-relative — vitest runs from the package root.
 */

const read = (path: string) => readFileSync(path, "utf8");

const ROOT = "../..";
const DEPLOY = read(`${ROOT}/DEPLOY.md`);

/** How the routing table writes one route. */
const row = (route: Route) =>
	`| \`${route.path}\` | \`${route.container}\` | ${
		isBehindAccess(route.path) ? "Required" : "Public"
	} | ${route.serves} |`;

/**
 * The paths of the Access application's `Domains` row, as the document writes
 * them: `host/path`, comma-separated, in backticks.
 */
const documentedAccessPaths = () => {
	const cell = DEPLOY.match(/^\|\s*Domains\s*\|(.+?)\|\s*$/m)?.[1] ?? "";

	return [...cell.matchAll(/`([^`]+)`/g)]
		.map((m) => (m[1] as string).trim())
		.map((domain) => domain.slice(SITE_HOST.length));
};

/** The env names `packages/api/src/config.ts` actually reads. */
const apiConfigEnv = [
	...read(`${ROOT}/packages/api/src/config.ts`).matchAll(
		/Config\.\w+\("(\w+)"\)/g,
	),
].map((m) => m[1] as string);

describe("the routing table", () => {
	it("has a row for every route, and none it invented", () => {
		for (const route of ROUTES) expect(DEPLOY).toContain(row(route));

		const rows = [...DEPLOY.matchAll(/^\| `(\/[^`]*)` \| `([\w-]+)` \|/gm)];
		expect(rows).toHaveLength(ROUTES.length);
	});

	it("names the image each container is built from", () => {
		for (const dir of ["api", "web", "landing-page"]) {
			expect(DEPLOY).toContain(`packages/${dir}/Dockerfile`);
			expect(existsSync(`${ROOT}/packages/${dir}/Dockerfile`)).toBe(true);
		}
	});
});

describe("the Cloudflare Access section", () => {
	it("declares exactly the paths the boundary covers", () => {
		expect([...documentedAccessPaths()].sort()).toStrictEqual(
			[...ACCESS_APPLICATION.paths].sort(),
		);
	});

	it("leaves the site root out of the application", () => {
		// The one thing a reader could copy wrong and not notice until a stranger
		// reports the landing page asking them to log in.
		for (const path of documentedAccessPaths()) expect(path).not.toBe("/");
	});

	it("says what a logged-out visitor gets at each end of the boundary", () => {
		expect(DEPLOY).toContain(siteUrl("/"));
		expect(DEPLOY).toContain(siteUrl(ACCESS_APPLICATION.paths[0] as string));
	});
});

describe("the environment tables", () => {
	it("name every variable the API reads, and the upstream web needs", () => {
		for (const name of apiConfigEnv) expect(DEPLOY).toContain(name);
		expect(DEPLOY).toContain("API_UPSTREAM");
	});

	it("no longer carries the claude token as deployment configuration", () => {
		// Since issue #122 the Claude Code token is a credential pasted in the app,
		// read from the encrypted store and from nowhere else. A row for it in a
		// deploy's environment table is a secret an operator would keep rotating
		// into a variable nothing reads — and would believe was live.
		expect(DEPLOY).not.toContain("CLAUDE_CODE_OAUTH_TOKEN");
	});

	it("documents the host as configuration, defaulting to this install's", () => {
		expect(DEPLOY).toContain("SITE_HOST");
		expect(DEPLOY).toContain(SITE_HOST);
	});
});

describe("the security model", () => {
	it("still forbids giving the API a domain of its own", () => {
		// A domain publishes it through the reverse proxy, past Access, with
		// `POST /api/database/reset` unauthenticated behind it.
		expect(DEPLOY).toMatch(/no domain|never.{0,40}domain/i);
		expect(DEPLOY).toContain("database/reset");
	});
});

describe("the section on going public", () => {
	it("makes the history check a step rather than an assumption", () => {
		expect(DEPLOY).toContain("git log --all --full-history");
		expect(DEPLOY).toContain("scripts/scrub-bank-statements.sh --verify");
		expect(existsSync(`${ROOT}/scripts/scrub-bank-statements.sh`)).toBe(true);
	});

	it("sends a red history check somewhere that says what to do about it", () => {
		// The check is a one-liner; the rewrite behind it is a coordinated
		// force-push over every branch, and a checklist step that only says
		// "expect: clean" leaves the reader nowhere to go when it is not.
		const runbook = "docs/operations/bank-statement-scrub.md";

		expect(DEPLOY).toContain(`(${runbook})`);
		expect(existsSync(`${ROOT}/${runbook}`)).toBe(true);
	});
});

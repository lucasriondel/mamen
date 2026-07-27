import { Layer } from "effect";
import { Outbound, type OutboundOps } from "./outbound";

/**
 * Test wiring for the {@link Outbound} seam — the analog of `import/test.ts`
 * for the network. Everything the SSRF guards exist for (a host that redirects
 * inward, a body with no end, a host that never answers, a Google that is out
 * of quota) is a couple of lines here and unreachable over the real internet.
 *
 * See `outbound.ts` for why the seam is a tag of our own rather than
 * `HttpClient`.
 */

/** How a stub host answers one request. */
export type Route = (url: string) => Response | Promise<Response>;

/**
 * Answer from a table keyed by exact URL; anything absent is a refused
 * connection. Convenient when the URLs under test are known strings — for
 * requests whose URL varies (a query string, a credential) pass a `respond`
 * function directly.
 */
export const routeTable =
	(routes: Record<string, Route>): Route =>
	(url) => {
		const route = routes[url];
		if (route === undefined) throw new Error(`ECONNREFUSED ${url}`);
		return route(url);
	};

/**
 * A fake network. Records what was asked of both halves, so a test can assert
 * on what did *not* happen — "refused before any connection is made" is only
 * provable by an empty `fetched`.
 *
 * Both halves reject by default: a test that reaches the network without
 * saying how it should answer has found a bug, not a default.
 */
export const stubOutbound = (
	opts: {
		readonly addresses?: Record<string, ReadonlyArray<string>>;
		readonly respond?: Route;
	} = {},
) => {
	const lookups: string[] = [];
	const fetched: string[] = [];
	const inits: RequestInit[] = [];
	const signals: AbortSignal[] = [];

	const ops: OutboundOps = {
		lookup: (hostname) => {
			lookups.push(hostname);
			const addresses = opts.addresses?.[hostname];
			return addresses === undefined
				? Promise.reject(new Error(`ENOTFOUND ${hostname}`))
				: Promise.resolve(addresses);
		},
		fetch: (url, init) => {
			fetched.push(url);
			inits.push(init);
			if (init.signal) signals.push(init.signal);
			if (opts.respond === undefined) {
				return Promise.reject(new Error(`ECONNREFUSED ${url}`));
			}
			// `try`, so a `respond` that throws reads as a transport failure
			// rather than a defect — that is what a refused connection is.
			try {
				return Promise.resolve(opts.respond(url));
			} catch (cause) {
				return Promise.reject(cause);
			}
		},
	};

	return {
		layer: Layer.succeed(Outbound, ops),
		lookups,
		fetched,
		inits,
		signals,
	};
};

/**
 * The `Outbound` for the many handler tests that build the whole API but never
 * touch **Logo search**. It refuses everything on purpose: the alternative is a
 * benign stub, under which a test that started reaching the network would go on
 * passing silently. `ClaudeCodeStub` can afford to answer benignly because
 * nothing it answers leaves the machine; this one cannot.
 */
export const OutboundStub = stubOutbound().layer;

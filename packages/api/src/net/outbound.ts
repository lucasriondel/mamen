import { lookup } from "node:dns/promises";
import { Context, Layer } from "effect";

/**
 * Everything this server does that leaves its own process and touches the
 * network *on a caller's behalf* — the logo.dev lookup proxy and the
 * **Logo search** image download (ADR 0007).
 *
 * It exists as a service, rather than the two call sites reaching for
 * `globalThis.fetch` and `node:dns`, because the whole point of that download
 * is the guards *around* the network call: HTTPS-only, the resolved address
 * checked before connecting, redirects re-checked per hop, a streaming byte cap
 * and a timeout. A guard is only worth what its tests prove, and none of those
 * can be proven against the real internet — "a host that redirects to
 * 169.254.169.254", "a body that never ends", "a host that never answers" are
 * not things to go and find. Behind this seam they are three lines of stub, and
 * the code under test is the real guard rather than a paraphrase of it.
 *
 * Deliberately *not* `@effect/platform`'s `HttpClient`: under
 * `NodeHttpServer.layerTest` that tag is already bound to the test server, so a
 * handler requiring it would silently pick up the loopback client instead of
 * whatever the test meant to install. A tag of our own cannot be captured by
 * accident.
 */
export interface OutboundOps {
  /**
   * `fetch`, narrowed to what the guarded path uses. The caller always passes
   * `redirect: "manual"` — following redirects is the *caller's* job precisely
   * because each hop needs re-checking.
   */
  readonly fetch: (url: string, init: RequestInit) => Promise<Response>;
  /**
   * Resolve a hostname to every address it answers with. All of them, not the
   * first: a name that returns one public and one private address must be
   * refused, and `lookup` without `all` would show only one of the two.
   */
  readonly lookup: (hostname: string) => Promise<ReadonlyArray<string>>;
}

export class Outbound extends Context.Tag("Outbound")<Outbound, OutboundOps>() {}

/**
 * The real network: the platform `fetch` and the OS resolver.
 *
 * `verbatim: true` keeps the resolver's own ordering instead of Node's
 * IPv4-first re-sort — irrelevant to a caller picking one address, but this
 * caller inspects every address, and reordering a list you are about to reject
 * as a set is pure noise.
 */
export const OutboundLive = Layer.succeed(Outbound, {
  fetch: (url, init) => globalThis.fetch(url, init),
  lookup: (hostname) =>
    lookup(hostname, { all: true, verbatim: true }).then((addresses) =>
      addresses.map((a) => a.address),
    ),
});

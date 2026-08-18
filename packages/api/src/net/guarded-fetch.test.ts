import { assert, describe, it } from "@effect/vitest";
import { ImageFetchRefused } from "@mamen/shared/contract";
import { Effect, Fiber, TestClock } from "effect";
import { FETCH_TIMEOUT, fetchGuarded, MAX_FETCH_BYTES, MAX_REDIRECTS } from "./guarded-fetch";
import { type Route, routeTable, stubOutbound } from "./test";

/**
 * A fake network: a resolver table and a route table, plus a log of what was
 * asked of each. Everything the guards exist for — a host that redirects
 * inward, a body that never ends, a host that never answers — is a two-line
 * route here and unreachable over the real internet, which is the whole reason
 * `Outbound` is a seam (see its docstring).
 *
 * The seam itself is the shared `stubOutbound`, the same one the endpoint tests
 * install: a private copy here would let this suite go on passing against a
 * stub the rest of the codebase had stopped using.
 */
const stubNet = (opts: {
  readonly addresses?: Record<string, ReadonlyArray<string>>;
  readonly routes?: Record<string, Route>;
}) =>
  stubOutbound({
    addresses: opts.addresses,
    respond: routeTable(opts.routes ?? {}),
  });

/** A public host, so the address guard is never what a test trips over. */
const PUBLIC = { "logos.example": ["93.184.216.34"] } as const;

const redirect = (to: string, status = 302) =>
  new Response(null, { status, headers: { location: to } });

/** Run and reduce to the refusal reason, or `null` when it succeeded. */
const reasonFor = (url: string, net: ReturnType<typeof stubNet>) =>
  fetchGuarded(url).pipe(
    Effect.map(() => null),
    Effect.catchTag("ImageFetchRefused", (e) => Effect.succeed(e.reason)),
    Effect.provide(net.layer),
  );

describe("fetchGuarded", () => {
  it.effect("returns the body of a public https URL", () =>
    Effect.gen(function* () {
      const net = stubNet({
        addresses: PUBLIC,
        routes: {
          "https://logos.example/acme.png": () => new Response(new Uint8Array([1, 2, 3])),
        },
      });
      const bytes = yield* fetchGuarded("https://logos.example/acme.png").pipe(
        Effect.provide(net.layer),
      );
      assert.deepStrictEqual([...bytes], [1, 2, 3]);
    }),
  );

  it.effect("never lets the platform follow redirects itself", () =>
    Effect.gen(function* () {
      // The single most load-bearing line in this module. With
      // `redirect: "follow"` the platform chases the chain inside one call
      // and every per-hop address check below becomes decoration — the guard
      // would pass its own tests while fetching whatever the last hop named.
      const net = stubNet({
        addresses: PUBLIC,
        routes: {
          "https://logos.example/acme.png": () => new Response(new Uint8Array()),
        },
      });
      yield* fetchGuarded("https://logos.example/acme.png").pipe(Effect.provide(net.layer));
      assert.deepStrictEqual(
        net.inits.map((i) => i.redirect),
        ["manual"],
      );
    }),
  );

  it.effect("refuses a non-https URL before opening any connection", () =>
    Effect.gen(function* () {
      const net = stubNet({
        addresses: PUBLIC,
        routes: {
          "http://logos.example/acme.png": () => new Response(new Uint8Array()),
        },
      });
      assert.strictEqual(yield* reasonFor("http://logos.example/acme.png", net), "not-https");
      assert.deepStrictEqual(net.fetched, []);
    }),
  );

  it.effect("refuses a private address before opening any connection", () =>
    Effect.gen(function* () {
      // The route exists and would answer happily; the assertion that
      // nothing was fetched is what pins "*before* connecting" rather than
      // "connected, then discarded the answer".
      const net = stubNet({
        addresses: { "internal.example": ["10.0.0.5"] },
        routes: {
          "https://internal.example/secret.png": () => new Response(new Uint8Array([9])),
        },
      });
      assert.strictEqual(
        yield* reasonFor("https://internal.example/secret.png", net),
        "private-address",
      );
      assert.deepStrictEqual(net.fetched, []);
    }),
  );

  it.effect("follows a redirect to another public host", () =>
    Effect.gen(function* () {
      const net = stubNet({
        addresses: { ...PUBLIC, "cdn.example": ["93.184.216.35"] },
        routes: {
          "https://logos.example/acme.png": () => redirect("https://cdn.example/real.png"),
          "https://cdn.example/real.png": () => new Response(new Uint8Array([7, 7])),
        },
      });
      const bytes = yield* fetchGuarded("https://logos.example/acme.png").pipe(
        Effect.provide(net.layer),
      );
      assert.deepStrictEqual([...bytes], [7, 7]);
      assert.deepStrictEqual(net.fetched, [
        "https://logos.example/acme.png",
        "https://cdn.example/real.png",
      ]);
    }),
  );

  it.effect("re-checks the address at every redirect hop", () =>
    Effect.gen(function* () {
      // The attack the per-hop check exists for: a host that passes the
      // address guard and then points the server at the cloud metadata
      // endpoint. Checking only the URL the caller supplied would fetch it.
      const net = stubNet({
        addresses: PUBLIC,
        routes: {
          "https://logos.example/acme.png": () =>
            redirect("https://169.254.169.254/latest/meta-data/"),
          "https://169.254.169.254/latest/meta-data/": () => new Response(new Uint8Array([1])),
        },
      });
      assert.strictEqual(
        yield* reasonFor("https://logos.example/acme.png", net),
        "private-address",
      );
      // Hop one was fetched; the internal hop never was.
      assert.deepStrictEqual(net.fetched, ["https://logos.example/acme.png"]);
    }),
  );

  it.effect("re-checks the scheme at every redirect hop", () =>
    Effect.gen(function* () {
      const net = stubNet({
        addresses: PUBLIC,
        routes: {
          "https://logos.example/acme.png": () => redirect("http://logos.example/downgraded.png"),
          "http://logos.example/downgraded.png": () => new Response(new Uint8Array([1])),
        },
      });
      assert.strictEqual(yield* reasonFor("https://logos.example/acme.png", net), "not-https");
      assert.deepStrictEqual(net.fetched, ["https://logos.example/acme.png"]);
    }),
  );

  it.effect("resolves a relative Location against the hop that sent it", () =>
    Effect.gen(function* () {
      const net = stubNet({
        addresses: PUBLIC,
        routes: {
          "https://logos.example/a/acme.png": () => redirect("../b/real.png"),
          "https://logos.example/b/real.png": () => new Response(new Uint8Array([4])),
        },
      });
      const bytes = yield* fetchGuarded("https://logos.example/a/acme.png").pipe(
        Effect.provide(net.layer),
      );
      assert.deepStrictEqual([...bytes], [4]);
    }),
  );

  it.effect("caps the redirect chain", () =>
    Effect.gen(function* () {
      // A chain one hop longer than the cap allows, so the refusal is the
      // cap firing rather than the chain running out.
      const routes: Record<string, Route> = {};
      for (let hop = 0; hop <= MAX_REDIRECTS + 1; hop++) {
        routes[`https://logos.example/${hop}`] = () => redirect(`https://logos.example/${hop + 1}`);
      }
      const net = stubNet({ addresses: PUBLIC, routes });
      assert.strictEqual(yield* reasonFor("https://logos.example/0", net), "too-many-redirects");
      // The original request plus MAX_REDIRECTS followed hops, and no more.
      assert.strictEqual(net.fetched.length, MAX_REDIRECTS + 1);
    }),
  );

  it.effect("follows a chain exactly at the cap", () =>
    Effect.gen(function* () {
      const routes: Record<string, Route> = {};
      for (let hop = 0; hop < MAX_REDIRECTS; hop++) {
        routes[`https://logos.example/${hop}`] = () => redirect(`https://logos.example/${hop + 1}`);
      }
      routes[`https://logos.example/${MAX_REDIRECTS}`] = () => new Response(new Uint8Array([42]));
      const net = stubNet({ addresses: PUBLIC, routes });
      const bytes = yield* fetchGuarded("https://logos.example/0").pipe(Effect.provide(net.layer));
      // Proves the cap is off-by-none: the last permitted hop still lands.
      assert.deepStrictEqual([...bytes], [42]);
    }),
  );

  it.effect("refuses a redirect with no Location", () =>
    Effect.gen(function* () {
      const net = stubNet({
        addresses: PUBLIC,
        routes: {
          "https://logos.example/acme.png": () => new Response(null, { status: 302 }),
        },
      });
      assert.strictEqual(yield* reasonFor("https://logos.example/acme.png", net), "unreachable");
    }),
  );

  it.effect("refuses an error status", () =>
    Effect.gen(function* () {
      const net = stubNet({
        addresses: PUBLIC,
        routes: {
          "https://logos.example/acme.png": () => new Response("nope", { status: 404 }),
        },
      });
      assert.strictEqual(yield* reasonFor("https://logos.example/acme.png", net), "unreachable");
    }),
  );

  it.effect("refuses a transport failure", () =>
    Effect.gen(function* () {
      // No route registered: the stub rejects, as a refused connection or a
      // TLS failure would.
      const net = stubNet({ addresses: PUBLIC });
      assert.strictEqual(yield* reasonFor("https://logos.example/acme.png", net), "unreachable");
    }),
  );

  it.effect("accepts a body just under the cap", () =>
    Effect.gen(function* () {
      const net = stubNet({
        addresses: PUBLIC,
        routes: {
          "https://logos.example/acme.png": () => new Response(new Uint8Array(MAX_FETCH_BYTES)),
        },
      });
      const bytes = yield* fetchGuarded("https://logos.example/acme.png").pipe(
        Effect.provide(net.layer),
      );
      // The cap is a ceiling, not a strict bound: exactly at it is fine, so a
      // refusal below can never be "big things fail".
      assert.strictEqual(bytes.byteLength, MAX_FETCH_BYTES);
    }),
  );

  it.effect("aborts an oversized body during streaming, not after", () =>
    Effect.gen(function* () {
      const CHUNK = 64 * 1024;
      let produced = 0;
      let cancelled = false;
      const net = stubNet({
        addresses: PUBLIC,
        routes: {
          "https://logos.example/endless.png": () =>
            new Response(
              // An *endless* body, produced only on demand. This is the
              // assertion that no other shape can make: an implementation
              // that buffered the response and then measured it would
              // never reach a size check at all — this test would hang
              // until vitest killed it, not fail. Reaching the assertions
              // below is itself the proof that the cap fires mid-stream.
              new ReadableStream({
                pull(controller) {
                  produced += CHUNK;
                  controller.enqueue(new Uint8Array(CHUNK));
                },
                cancel() {
                  cancelled = true;
                },
              }),
            ),
        },
      });
      assert.strictEqual(yield* reasonFor("https://logos.example/endless.png", net), "too-large");
      // The producer was told to stop, so the connection isn't left draining
      // a body nobody will read.
      assert.isTrue(cancelled);
      // And it was told promptly. Two chunks of slack, both accounted for:
      // one is the chunk that carries the total past the cap (the read that
      // trips it), the other is the one the stream had already pulled into
      // its own queue to satisfy the default high-water mark. Neither grows
      // with the body, which is the property being pinned — an
      // implementation that read to the end would land here in the
      // gigabytes, or never.
      assert.isAtMost(produced, MAX_FETCH_BYTES + 2 * CHUNK);
    }),
  );

  it.effect("abandons a host that never answers, at the timeout", () =>
    Effect.gen(function* () {
      const net = stubNet({
        addresses: PUBLIC,
        routes: {
          // Never settles — a host that accepts the connection and then
          // says nothing, which no amount of waiting improves.
          "https://logos.example/blackhole.png": () => new Promise<Response>(() => {}),
        },
      });
      const fiber = yield* Effect.fork(reasonFor("https://logos.example/blackhole.png", net));
      yield* TestClock.adjust(FETCH_TIMEOUT);
      assert.strictEqual(yield* Fiber.join(fiber), "timeout");
      // And the request was actually abandoned, not merely stopped being
      // waited on: a timeout that leaks the socket is a slower leak.
      assert.isTrue(net.signals.every((s) => s.aborted));
    }),
  );

  it.effect("abandons a body that stalls mid-stream", () =>
    Effect.gen(function* () {
      let cancelled = false;
      const net = stubNet({
        addresses: PUBLIC,
        routes: {
          "https://logos.example/trickle.png": () =>
            new Response(
              // Headers arrive, then the body stops. The timeout has to
              // cover the read, not just the connect, or a slow-drip
              // sender holds the request open indefinitely.
              new ReadableStream({
                start(controller) {
                  controller.enqueue(new Uint8Array([1]));
                },
                pull() {
                  return new Promise<void>(() => {});
                },
                cancel() {
                  cancelled = true;
                },
              }),
            ),
        },
      });
      const fiber = yield* Effect.fork(reasonFor("https://logos.example/trickle.png", net));
      yield* TestClock.adjust(FETCH_TIMEOUT);
      assert.strictEqual(yield* Fiber.join(fiber), "timeout");
      // And the *server* let go too, not just the caller. Interrupting an
      // Effect does not stop the promise underneath it, so without an explicit
      // release the read loop keeps pulling on a socket the client has already
      // been told timed out — buffering toward the cap, holding a file
      // descriptor, for as long as the sender cares to drip. Same property the
      // never-answers case asserts through its abort signal; that signal
      // belongs to the connect, which by here has already succeeded.
      yield* Effect.yieldNow();
      assert.isTrue(cancelled);
    }),
  );

  it.effect("fails with ImageFetchRefused, never a defect", () =>
    Effect.gen(function* () {
      const net = stubNet({ addresses: PUBLIC });
      const error = yield* fetchGuarded("https://logos.example/acme.png").pipe(
        Effect.provide(net.layer),
        Effect.flip,
      );
      assert.instanceOf(error, ImageFetchRefused);
    }),
  );
});

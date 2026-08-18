import { assert, describe, it } from "@effect/vitest";
import {
  LogoSearchFailed,
  LogoSearchQuotaExceeded,
  LogoSearchUnconfigured,
} from "@mamen/shared/contract";
import { ConfigProvider, Effect, Fiber, Layer, TestClock } from "effect";
import { FETCH_TIMEOUT } from "../net/guarded-fetch";
import { Outbound } from "../net/outbound";
import { searchLogos } from "./search";

const TOKEN = "pk_test_token";

/**
 * Config from a map rather than `process.env`: the unconfigured state is half
 * of what this module does, and an env-backed test would depend on the
 * ambient environment for its most important case.
 */
const withConfig = (entries: Record<string, string>) =>
  Effect.withConfigProvider(ConfigProvider.fromMap(new Map(Object.entries(entries))));

const CONFIGURED = { LOGODEV_TOKEN: TOKEN };

/** A stub logo.dev. Records every request; never resolves DNS (nothing should). */
const stubLogodev = (respond: (url: string) => Response | Promise<Response>) => {
  const requested: string[] = [];
  const layer = Layer.succeed(Outbound, {
    lookup: () => Promise.reject(new Error("the search proxy must not resolve")),
    fetch: (url) => {
      requested.push(url);
      return Promise.resolve(respond(url));
    },
  });
  return { layer, requested };
};

/** logo.dev answers a known name with image bytes, not JSON. */
const png = (status = 200) =>
  new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
    status,
    headers: { "content-type": "image/png" },
  });

const run = (
  net: ReturnType<typeof stubLogodev>,
  config: Record<string, string> = CONFIGURED,
  query = "acme",
) => searchLogos(query).pipe(Effect.provide(net.layer), withConfig(config));

describe("searchLogos — configuration", () => {
  it.effect("reports itself unconfigured when the token is not set", () =>
    Effect.gen(function* () {
      const net = stubLogodev(() => png());
      const error = yield* run(net, {}).pipe(Effect.flip);
      assert.instanceOf(error, LogoSearchUnconfigured);
      // Names the variable, so the UI can say what to set rather than
      // "search is broken" — the distinct-state requirement is only worth
      // anything if it carries enough to act on.
      assert.deepStrictEqual([...error.missing], ["LOGODEV_TOKEN"]);
      // And it costs nothing: no call is made with credentials it hasn't got.
      assert.deepStrictEqual(net.requested, []);
    }),
  );

  it.effect("treats a blank value as absent", () =>
    Effect.gen(function* () {
      // `LOGODEV_TOKEN=` in an env file is set-but-empty, which every layer
      // below here would happily send to logo.dev to be rejected.
      // Unconfigured is what it means.
      const net = stubLogodev(() => png());
      const error = yield* run(net, { LOGODEV_TOKEN: "   " }).pipe(Effect.flip);
      assert.instanceOf(error, LogoSearchUnconfigured);
      assert.deepStrictEqual([...error.missing], ["LOGODEV_TOKEN"]);
      assert.deepStrictEqual(net.requested, []);
    }),
  );
});

describe("searchLogos — results", () => {
  it.effect("probes logo.dev's name lookup exactly once", () =>
    Effect.gen(function* () {
      const net = stubLogodev(() => png());
      yield* run(net, CONFIGURED, "crédit agricole");

      // One upstream request answers for all three theme variants: they are
      // the same asset re-rendered, so existence is shared.
      assert.strictEqual(net.requested.length, 1);
      const url = new URL(net.requested[0]!);
      assert.strictEqual(url.origin, "https://img.logo.dev");
      // The name rides in the path, encoded — spaces, accents and all.
      assert.strictEqual(url.pathname, "/name/cr%C3%A9dit%20agricole");
      assert.strictEqual(url.searchParams.get("token"), TOKEN);
      // Without this an unknown name comes back as a 200 monogram, and "no
      // logos found" would be unrepresentable.
      assert.strictEqual(url.searchParams.get("fallback"), "404");
    }),
  );

  it.effect("offers the logo on all three backgrounds", () =>
    Effect.gen(function* () {
      const net = stubLogodev(() => png());
      const { results } = yield* run(net);

      assert.deepStrictEqual(
        results.map((r) => r.title),
        ["acme", "acme — light background", "acme — dark background"],
      );
      for (const [i, theme] of (["auto", "light", "dark"] as const).entries()) {
        const image = new URL(results[i]!.imageUrl);
        const thumb = new URL(results[i]!.thumbnailUrl);
        assert.strictEqual(image.searchParams.get("theme"), theme);
        assert.strictEqual(thumb.searchParams.get("theme"), theme);
        // The stored image is normalised from the full-size URL; the grid
        // loads the smaller one.
        assert.strictEqual(image.searchParams.get("size"), "256");
        assert.strictEqual(thumb.searchParams.get("size"), "128");
        // Every URL keeps `fallback=404`: a picked result whose logo has
        // vanished upstream must refuse, not silently store a monogram.
        assert.strictEqual(image.searchParams.get("fallback"), "404");
      }
    }),
  );

  it.effect("returns nothing for a name logo.dev does not know", () =>
    Effect.gen(function* () {
      // `fallback=404` at work: an unknown name is an empty result set, not
      // a failure.
      const net = stubLogodev(() => new Response(null, { status: 404 }));
      const { results } = yield* run(net);
      assert.deepStrictEqual(results, []);
    }),
  );
});

describe("searchLogos — quota", () => {
  it.effect("reports a spent rate limit as its own error on 429", () =>
    Effect.gen(function* () {
      const net = stubLogodev(() => new Response(null, { status: 429 }));
      const error = yield* run(net).pipe(Effect.flip);
      // Its own error, not a transport failure: the fix is wait or pay, and
      // nothing in the UI should suggest retrying now.
      assert.instanceOf(error, LogoSearchQuotaExceeded);
    }),
  );
});

describe("searchLogos — failures", () => {
  it.effect("reports a server error as a transport failure", () =>
    Effect.gen(function* () {
      const net = stubLogodev(() => png(500));
      const error = yield* run(net).pipe(Effect.flip);
      assert.instanceOf(error, LogoSearchFailed);
      assert.include(error.message, "500");
    }),
  );

  it.effect("reports a rejected token as a failure, not a quota", () =>
    Effect.gen(function* () {
      // A wrong or revoked token is 401 — emphatically not "come back later".
      const net = stubLogodev(() => new Response(null, { status: 401 }));
      const error = yield* run(net).pipe(Effect.flip);
      assert.instanceOf(error, LogoSearchFailed);
    }),
  );

  it.effect("reports a refused connection as a transport failure", () =>
    Effect.gen(function* () {
      const net = stubLogodev(() => {
        throw new Error("ECONNREFUSED");
      });
      assert.instanceOf(yield* run(net).pipe(Effect.flip), LogoSearchFailed);
    }),
  );

  it.effect("never leaks the token into a client-visible error", () =>
    Effect.gen(function* () {
      // The message reaches the browser, and the token is in the request URL
      // a naive "include what we were doing" message would quote. The token
      // is publishable, but the habit is not.
      const net = stubLogodev(() => png(500));
      const error = yield* run(net).pipe(Effect.flip);
      assert.instanceOf(error, LogoSearchFailed);
      assert.notInclude(error.message, TOKEN);
    }),
  );

  it.effect("gives up on a logo.dev that never answers", () =>
    Effect.gen(function* () {
      const net = stubLogodev(() => new Promise<Response>(() => {}));
      const fiber = yield* Effect.fork(run(net).pipe(Effect.flip));
      yield* TestClock.adjust(FETCH_TIMEOUT);
      // A hang is a transport failure, not a quota one: retrying is exactly
      // the right advice here.
      assert.instanceOf(yield* Fiber.join(fiber), LogoSearchFailed);
    }),
  );
});

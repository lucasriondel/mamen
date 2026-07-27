import { assert, describe, it } from "@effect/vitest";
import { ImageFetchRefused } from "@mamen/shared/contract";
import { Effect, Exit, Layer } from "effect";
import { Outbound } from "./outbound";
import { assertPublicUrl, isBlockedAddress } from "./ssrf";

/**
 * An `Outbound` whose resolver answers from a fixed table and counts its calls.
 * Nothing here can reach the network: `fetch` throws if touched, which is what
 * makes "refused *before any connection is made*" testable at all — the
 * assertion is that the transport was never entered, not that it returned
 * something.
 */
const stubResolver = (table: Record<string, ReadonlyArray<string>>) => {
	const lookups: string[] = [];
	const layer = Layer.succeed(Outbound, {
		fetch: () => {
			throw new Error("the address guard must not connect");
		},
		lookup: (hostname) => {
			lookups.push(hostname);
			const addresses = table[hostname];
			if (addresses === undefined) {
				return Promise.reject(new Error(`ENOTFOUND ${hostname}`));
			}
			return Promise.resolve(addresses);
		},
	});
	return { layer, lookups };
};

/** Run `assertPublicUrl` and return the refusal reason, or `null` if allowed. */
const refusalFor = (url: string, resolver: ReturnType<typeof stubResolver>) =>
	assertPublicUrl(url).pipe(
		Effect.map(() => null),
		Effect.catchTag("ImageFetchRefused", (e) => Effect.succeed(e.reason)),
		Effect.provide(resolver.layer),
	);

describe("isBlockedAddress", () => {
	// Every range the ADR names, plus the ones an SSRF payload actually reaches
	// for. 169.254.169.254 is the cloud metadata endpoint — the single most
	// valuable target of this class of bug, and the reason link-local is on the
	// list at all.
	const blocked = [
		["this-network", "0.0.0.0"],
		["private 10/8", "10.0.0.1"],
		["private 172.16/12 low", "172.16.0.1"],
		["private 172.16/12 high", "172.31.255.254"],
		["private 192.168/16", "192.168.1.1"],
		["loopback", "127.0.0.1"],
		["loopback, non-.1", "127.9.9.9"],
		["link-local", "169.254.1.1"],
		["cloud metadata", "169.254.169.254"],
		["carrier-grade NAT", "100.64.0.1"],
		["IETF benchmark", "198.18.0.1"],
		["multicast", "224.0.0.1"],
		["reserved", "240.0.0.1"],
		["broadcast", "255.255.255.255"],
		["v6 unspecified", "::"],
		["v6 loopback", "::1"],
		["v6 unique-local", "fd00::1"],
		["v6 unique-local, fc arm", "fc00::1"],
		["v6 link-local", "fe80::1"],
		["v6 multicast", "ff02::1"],
		["v4-mapped loopback", "::ffff:127.0.0.1"],
		["v4-mapped private", "::ffff:10.0.0.1"],
		["v4-mapped, hex form", "::ffff:7f00:1"],
	] as const;

	for (const [what, address] of blocked) {
		it(`blocks ${what} (${address})`, () => {
			assert.isTrue(isBlockedAddress(address));
		});
	}

	const allowed = [
		["a public v4", "93.184.216.34"],
		["a public v4 near 172/8 but outside 172.16/12", "172.15.0.1"],
		["a public v4 just above 172.31", "172.32.0.1"],
		["a public v4 near 169/8 but outside link-local", "169.253.0.1"],
		["a public v4 below the CGNAT block", "100.63.255.255"],
		["a public v6", "2001:4860:4860::8888"],
		["a public v6 near fc00::/7", "fe00::1"],
		["a v4-mapped public address", "::ffff:93.184.216.34"],
	] as const;

	for (const [what, address] of allowed) {
		it(`allows ${what} (${address})`, () => {
			assert.isFalse(isBlockedAddress(address));
		});
	}

	// Fail closed. An address this code cannot classify is not an address it can
	// vouch for, and the resolver is not a trusted source of well-formed strings
	// once a redirect chain is choosing the hostnames.
	for (const junk of ["", "not-an-ip", "1.2.3", "1.2.3.4.5", "999.1.1.1"]) {
		it(`blocks unparseable input ${JSON.stringify(junk)}`, () => {
			assert.isTrue(isBlockedAddress(junk));
		});
	}
});

describe("assertPublicUrl", () => {
	it.effect("accepts an https URL resolving to a public address", () =>
		Effect.gen(function* () {
			const resolver = stubResolver({ "logos.example": ["93.184.216.34"] });
			const url = yield* assertPublicUrl("https://logos.example/acme.png").pipe(
				Effect.provide(resolver.layer),
			);
			assert.strictEqual(url.href, "https://logos.example/acme.png");
			assert.deepStrictEqual(resolver.lookups, ["logos.example"]);
		}),
	);

	it.effect("refuses a non-https URL without resolving anything", () =>
		Effect.gen(function* () {
			const resolver = stubResolver({ "logos.example": ["93.184.216.34"] });
			assert.strictEqual(
				yield* refusalFor("http://logos.example/acme.png", resolver),
				"not-https",
			);
			// The scheme check is cheap and unconditional, so it runs before the
			// resolver is ever asked: a refused URL costs no DNS at all.
			assert.deepStrictEqual(resolver.lookups, []);
		}),
	);

	it.effect("refuses non-http schemes that could read the host", () =>
		Effect.gen(function* () {
			const resolver = stubResolver({});
			for (const url of [
				"file:///etc/passwd",
				"ftp://logos.example/acme.png",
				"data:image/png;base64,iVBORw0KGgo=",
			]) {
				assert.strictEqual(yield* refusalFor(url, resolver), "not-https");
			}
		}),
	);

	it.effect("refuses a string that is not an absolute URL", () =>
		Effect.gen(function* () {
			const resolver = stubResolver({});
			assert.strictEqual(
				yield* refusalFor("/uploads/issuers/nice-try.webp", resolver),
				"invalid-url",
			);
			assert.strictEqual(yield* refusalFor("", resolver), "invalid-url");
		}),
	);

	it.effect("refuses a host resolving to a private address", () =>
		Effect.gen(function* () {
			const resolver = stubResolver({ "internal.example": ["10.1.2.3"] });
			assert.strictEqual(
				yield* refusalFor("https://internal.example/x.png", resolver),
				"private-address",
			);
		}),
	);

	it.effect("refuses when any one of several addresses is private", () =>
		Effect.gen(function* () {
			// The interesting shape: a name that answers with a real public
			// address *and* an internal one. Checking only the first address —
			// which is what a bare `dns.lookup` returns — would let this through
			// whenever the resolver happened to order them this way.
			const resolver = stubResolver({
				"split.example": ["93.184.216.34", "192.168.0.7"],
			});
			assert.strictEqual(
				yield* refusalFor("https://split.example/x.png", resolver),
				"private-address",
			);
		}),
	);

	it.effect("checks a literal IP host directly, without resolving", () =>
		Effect.gen(function* () {
			const resolver = stubResolver({});
			assert.strictEqual(
				yield* refusalFor("https://127.0.0.1/x.png", resolver),
				"private-address",
			);
			assert.strictEqual(
				yield* refusalFor(
					"https://169.254.169.254/latest/meta-data/",
					resolver,
				),
				"private-address",
			);
			// A literal is already an address; asking DNS about it would either
			// fail or, worse, answer.
			assert.deepStrictEqual(resolver.lookups, []);
		}),
	);

	it.effect("checks a bracketed IPv6 literal host", () =>
		Effect.gen(function* () {
			const resolver = stubResolver({});
			// `URL.hostname` keeps the brackets; a guard that forgot to strip them
			// would fail to parse the address and — depending on which way it
			// failed — could wave loopback straight through.
			assert.strictEqual(
				yield* refusalFor("https://[::1]/x.png", resolver),
				"private-address",
			);
			assert.deepStrictEqual(resolver.lookups, []);
		}),
	);

	it.effect("allows a literal public IP host", () =>
		Effect.gen(function* () {
			const resolver = stubResolver({});
			assert.strictEqual(
				yield* refusalFor("https://93.184.216.34/x.png", resolver),
				null,
			);
		}),
	);

	it.effect("refuses a host that does not resolve", () =>
		Effect.gen(function* () {
			const resolver = stubResolver({});
			assert.strictEqual(
				yield* refusalFor("https://nope.example/x.png", resolver),
				"unresolvable",
			);
		}),
	);

	it.effect("refuses a host that resolves to nothing", () =>
		Effect.gen(function* () {
			const resolver = stubResolver({ "empty.example": [] });
			assert.strictEqual(
				yield* refusalFor("https://empty.example/x.png", resolver),
				"unresolvable",
			);
		}),
	);

	it.effect("fails with ImageFetchRefused, not a defect", () =>
		Effect.gen(function* () {
			const resolver = stubResolver({});
			const exit = yield* assertPublicUrl("https://127.0.0.1/x.png").pipe(
				Effect.provide(resolver.layer),
				Effect.exit,
			);
			assert.isTrue(Exit.isFailure(exit));
			const error = yield* assertPublicUrl("https://127.0.0.1/x.png").pipe(
				Effect.provide(resolver.layer),
				Effect.flip,
			);
			assert.instanceOf(error, ImageFetchRefused);
		}),
	);
});

import { isIP } from "node:net";
import { ImageFetchRefused } from "@mamen/shared/contract";
import { Effect } from "effect";
import { Outbound } from "./outbound";

/**
 * The address half of the SSRF guard (ADR 0007). Whether a URL may be fetched
 * comes down to *what address it reaches*, so this module answers exactly that
 * and nothing else; the redirect chain, byte cap and timeout live in
 * `guarded-fetch.ts`, which calls back here at every hop.
 *
 * Everything is decided from the parsed address bytes rather than by matching
 * the textual form. `127.0.0.1`, `127.1`, `0x7f.1`, `::ffff:127.0.0.1` and
 * `::ffff:7f00:1` are all loopback, and a string-shaped check catches roughly
 * the first of those.
 */

/** Parse dotted-quad IPv4 into four bytes, or `null` if it isn't one. */
const ipv4Bytes = (input: string): ReadonlyArray<number> | null => {
	const parts = input.split(".");
	if (parts.length !== 4) return null;
	const bytes: number[] = [];
	for (const part of parts) {
		// Reject anything but 1-3 plain digits: this reads a *resolver's* output,
		// so the only job is to parse the canonical form or admit it can't.
		if (!/^\d{1,3}$/.test(part)) return null;
		const byte = Number(part);
		if (byte > 255) return null;
		bytes.push(byte);
	}
	return bytes;
};

/**
 * Parse IPv6 into sixteen bytes, or `null` if it isn't one. Handles `::`
 * compression, a zone id (`%eth0`) and the embedded-IPv4 tail form
 * (`::ffff:127.0.0.1`).
 */
const ipv6Bytes = (input: string): ReadonlyArray<number> | null => {
	// A zone id is a local interface name; it says nothing about the address and
	// is not part of it.
	let text = input.split("%")[0] ?? "";
	if (!text.includes(":")) return null;

	// An embedded IPv4 tail occupies the last two groups. Swap it for two zero
	// groups so the general parse below sees a uniform shape, then splice the
	// real bytes back over them.
	let embedded: ReadonlyArray<number> | null = null;
	if (text.includes(".")) {
		const lastColon = text.lastIndexOf(":");
		embedded = ipv4Bytes(text.slice(lastColon + 1));
		if (embedded === null) return null;
		text = `${text.slice(0, lastColon + 1)}0:0`;
	}

	const halves = text.split("::");
	if (halves.length > 2) return null;
	const groupsOf = (half: string): number[] | null => {
		if (half === "") return [];
		const groups: number[] = [];
		for (const group of half.split(":")) {
			if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null;
			groups.push(Number.parseInt(group, 16));
		}
		return groups;
	};
	const head = groupsOf(halves[0] ?? "");
	const tail = halves.length === 2 ? groupsOf(halves[1] ?? "") : [];
	if (head === null || tail === null) return null;

	const present = head.length + tail.length;
	let groups: number[];
	if (halves.length === 2) {
		if (present > 8) return null;
		groups = [...head, ...Array<number>(8 - present).fill(0), ...tail];
	} else {
		if (present !== 8) return null;
		groups = head;
	}

	const bytes = groups.flatMap((group) => [group >> 8, group & 0xff]);
	if (embedded !== null) bytes.splice(12, 4, ...embedded);
	return bytes;
};

/**
 * The IPv4 ranges this server will not connect to. Private, loopback and
 * link-local are what ADR 0007 requires; the rest are on the list because they
 * are equally not "somewhere on the internet with a logo on it", and leaving a
 * reachable-but-unlisted range out is how these guards get bypassed.
 */
const isBlockedIpv4 = (bytes: ReadonlyArray<number>): boolean => {
	// Destructured with `?? -1` rather than asserted non-null: every caller
	// passes exactly four bytes, but a short array must not read as `undefined`
	// slipping through a comparison. -1 matches no range, so a malformed input
	// falls out of every arm and is then caught by the fail-closed parse above.
	const [a = -1, b = -1, c = -1] = bytes;
	return (
		a === 0 || // 0.0.0.0/8, "this network" — reaches the local host
		a === 10 || // 10.0.0.0/8, private
		a === 127 || // 127.0.0.0/8, loopback — the whole /8, not just .0.0.1
		(a === 100 && b >= 64 && b <= 127) || // 100.64/10, carrier-grade NAT
		(a === 169 && b === 254) || // 169.254/16, link-local + cloud metadata
		(a === 172 && b >= 16 && b <= 31) || // 172.16/12, private
		(a === 192 && b === 0 && c === 0) || // 192.0.0/24, IETF protocol assignments
		(a === 192 && b === 168) || // 192.168/16, private
		(a === 198 && (b === 18 || b === 19)) || // 198.18/15, benchmarking
		a >= 224 // 224/4 multicast + 240/4 reserved, incl. 255.255.255.255
	);
};

/** The IPv6 ranges this server will not connect to. */
const isBlockedIpv6 = (bytes: ReadonlyArray<number>): boolean => {
	const [a = -1, b = -1] = bytes;
	return (
		(a & 0xfe) === 0xfc || // fc00::/7, unique-local
		(a === 0xfe && (b & 0xc0) === 0x80) || // fe80::/10, link-local
		a === 0xff // ff00::/8, multicast
	);
};

/**
 * Is this address one the server refuses to connect to — private, loopback,
 * link-local, unique-local, or otherwise not a public internet host?
 *
 * **Fails closed**: an address that doesn't parse is blocked. This runs on
 * strings chosen by a redirect chain the caller doesn't control, so "I couldn't
 * tell" has to mean "no". The alternative reads as an allow-list bypass the
 * moment any resolver returns a form this parser doesn't know.
 */
export const isBlockedAddress = (address: string): boolean => {
	const v4 = ipv4Bytes(address);
	if (v4 !== null) return isBlockedIpv4(v4);

	const v6 = ipv6Bytes(address);
	if (v6 === null) return true;

	// IPv4-mapped (`::ffff:a.b.c.d`) and the deprecated IPv4-compatible
	// (`::a.b.c.d`) forms carry a v4 address in the low four bytes and must be
	// judged as that address — `::ffff:169.254.169.254` reaches the metadata
	// service just as well as the bare form. This also swallows `::` and `::1`,
	// which fall out as 0.0.0.0 and 0.0.0.1, both inside the blocked 0/8.
	const prefixIsZero = v6.slice(0, 10).every((byte) => byte === 0);
	const marker = ((v6[10] ?? 0) << 8) | (v6[11] ?? 0);
	if (prefixIsZero && (marker === 0xffff || marker === 0)) {
		return isBlockedIpv4(v6.slice(12));
	}

	return isBlockedIpv6(v6);
};

const refuse = (reason: typeof ImageFetchRefused.Type.reason) =>
	Effect.fail(new ImageFetchRefused({ reason }));

/**
 * Check a URL the server has been asked to fetch, and hand back the parsed
 * `URL` if it may be connected to.
 *
 * Order matters and is the point: the scheme is rejected before DNS is touched
 * (a refused URL costs nothing), and the address is resolved and judged
 * **before** anything opens a socket. The caller re-runs this at every redirect
 * hop, because a permitted host can redirect to an internal one.
 *
 * *Every* address a name answers with must be acceptable, not just the first —
 * a name resolving to one public and one private address is a private address
 * with extra steps, and which one a connection actually uses is not this code's
 * to decide.
 *
 * **Known limitation — DNS rebinding.** The address checked here and the
 * address `fetch` eventually connects to come from two separate resolutions, so
 * a name whose answer changes in between can slip past. Closing it means
 * connecting to the vetted IP directly and carrying the hostname in `Host` and
 * TLS SNI, which the platform `fetch` does not expose. The remaining exposure
 * is a same-host race against a caller who already had to guess an internal
 * address; the cap, the timeout and HTTPS-only all still apply.
 */
export const assertPublicUrl = (
	raw: string,
): Effect.Effect<URL, ImageFetchRefused, Outbound> =>
	Effect.gen(function* () {
		const url = yield* Effect.try({
			try: () => new URL(raw),
			catch: () => new ImageFetchRefused({ reason: "invalid-url" }),
		});

		// HTTPS only. `http:` is refused rather than upgraded — the caller picked
		// this URL off a search result, so silently rewriting it would fetch
		// something it never named — and the non-http schemes (`file:`, `ftp:`,
		// `data:`) are refused by the same clause, which is the useful part: they
		// read the host's own filesystem and network.
		if (url.protocol !== "https:") return yield* refuse("not-https");

		// `URL.hostname` keeps the brackets around an IPv6 literal; they are
		// syntax, not address.
		const host = url.hostname.replace(/^\[|\]$/g, "");

		// A literal is already an address. Resolving it would at best waste a
		// lookup and at worst let a resolver answer for it.
		if (isIP(host) !== 0) {
			return isBlockedAddress(host) ? yield* refuse("private-address") : url;
		}

		const outbound = yield* Outbound;
		const addresses = yield* Effect.tryPromise({
			try: () => outbound.lookup(host),
			catch: () => new ImageFetchRefused({ reason: "unresolvable" }),
		});
		if (addresses.length === 0) return yield* refuse("unresolvable");
		if (addresses.some(isBlockedAddress))
			return yield* refuse("private-address");

		return url;
	});

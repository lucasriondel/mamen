import { ImageFetchRefused, MAX_IMAGE_BYTES } from "@mamen/shared/contract";
import { Duration, Effect } from "effect";
import { Outbound } from "./outbound";
import { assertPublicUrl } from "./ssrf";

/**
 * Download a caller-supplied URL from inside the API's own network, under every
 * guard ADR 0007 requires. Used by **Logo search** to fetch a chosen result.
 *
 * The endpoint behind this is an **SSRF sink**, and it is reachable
 * independently of any search — so "the URL came from Google" is not a defence
 * and no such assumption is made here. The guards are on the fetch itself:
 *
 * - HTTPS only, checked **before** anything connects;
 * - the resolved address refused if it is private, loopback, link-local or
 *   unique-local, also before connecting;
 * - redirects followed manually, capped at {@link MAX_REDIRECTS}, with both
 *   checks re-run at **every hop** — a permitted host can redirect inward;
 * - a byte cap enforced **while** the body streams, so an endless response is
 *   abandoned rather than buffered;
 * - a timeout over the whole thing, read included.
 *
 * Every failure is an {@link ImageFetchRefused} carrying a reason — a refusal
 * by policy and a host that simply didn't answer are both "this URL did not
 * become an image", and the caller (and the UI) gets to tell them apart by
 * reason rather than by status code.
 *
 * What this does *not* do is authenticate or rate-limit its caller; both are
 * deferred (ADR 0007) and must land before public deployment. See
 * `docs/operations/logo-search-setup.md`.
 */

/**
 * How many redirects to follow. Three covers the real shapes — a shortener, a
 * CDN handoff, an http→https bounce — while bounding both the work one request
 * can cause and how many chances a chain gets to find an address the guard
 * mis-classifies.
 */
export const MAX_REDIRECTS = 3;

/**
 * The response byte ceiling, deliberately the same {@link MAX_IMAGE_BYTES} the
 * multipart parser applies to uploads. Both are the *pre-decode* bound on what
 * sharp is asked to open, so the two acquisition paths having different limits
 * would mean one of them was wrong.
 */
export const MAX_FETCH_BYTES = MAX_IMAGE_BYTES;

/** How long a remote host gets, connect through last byte. */
export const FETCH_TIMEOUT = Duration.seconds(10);

/** Marks an over-cap read, so it can be told apart from a transport failure. */
const OVERSIZED = Symbol("oversized");

const refuse = (reason: typeof ImageFetchRefused.Type.reason) =>
	Effect.fail(new ImageFetchRefused({ reason }));

/** Let go of a body we will not read, so nothing is left draining. */
const discard = (response: Response) =>
	Effect.tryPromise(() => response.body?.cancel() ?? Promise.resolve()).pipe(
		Effect.ignore,
	);

/**
 * Read a body, refusing it the moment it passes the cap.
 *
 * The check is inside the read loop, not after it: `await response.bytes()`
 * followed by a length check is not a cap at all — the bytes are already in
 * memory by the time it can fail, and against a body with no end it never
 * reaches the check.
 */
const readCapped = (response: Response) =>
	Effect.tryPromise({
		try: async (signal) => {
			if (response.body === null) return new Uint8Array();
			const reader = response.body.getReader();
			// Release the body when this effect is interrupted — which is how the
			// timeout arrives once headers have been received. Interrupting an
			// Effect abandons the *promise*, it does not stop it: without this the
			// loop goes on pulling from a socket the caller has already been told
			// timed out, buffering toward the cap and holding the descriptor for as
			// long as the sender cares to drip. The connect's own signal cannot do
			// this job, having already succeeded by the time we get here.
			//
			// `response.body.cancel()` is not the way to spell it: the body is
			// locked to this reader, so it would only throw.
			signal.addEventListener(
				"abort",
				() => void reader.cancel().catch(() => {}),
			);
			const chunks: Uint8Array[] = [];
			let total = 0;
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				total += value.byteLength;
				if (total > MAX_FETCH_BYTES) {
					// Tell the producer to stop before unwinding, so the sender is
					// not left pushing into a stream nobody reads.
					await reader.cancel();
					throw OVERSIZED;
				}
				chunks.push(value);
			}
			const body = new Uint8Array(total);
			let at = 0;
			for (const chunk of chunks) {
				body.set(chunk, at);
				at += chunk.byteLength;
			}
			return body;
		},
		catch: (cause) =>
			new ImageFetchRefused({
				reason: cause === OVERSIZED ? "too-large" : "unreachable",
			}),
	});

export const fetchGuarded = (
	raw: string,
): Effect.Effect<Uint8Array, ImageFetchRefused, Outbound> =>
	Effect.gen(function* () {
		const outbound = yield* Outbound;
		let target = raw;

		for (let hop = 0; ; hop++) {
			// Re-run on every iteration, not once before the loop: this is what
			// makes each redirect target as untrusted as the URL the caller sent.
			const url = yield* assertPublicUrl(target);

			const response = yield* Effect.tryPromise({
				// `redirect: "manual"` is load-bearing. Left to follow, the platform
				// would chase the chain inside this one call and every check above
				// would apply only to the first URL.
				try: (signal) =>
					outbound.fetch(url.href, {
						redirect: "manual",
						signal,
						headers: { accept: "image/*" },
					}),
				catch: () => new ImageFetchRefused({ reason: "unreachable" }),
			});

			if (response.status >= 300 && response.status < 400) {
				const location = response.headers.get("location");
				yield* discard(response);
				if (location === null) return yield* refuse("unreachable");
				if (hop === MAX_REDIRECTS) return yield* refuse("too-many-redirects");
				// Relative targets are legal and common; resolve against the hop
				// that sent them.
				target = yield* Effect.try({
					try: () => new URL(location, url).href,
					catch: () => new ImageFetchRefused({ reason: "invalid-url" }),
				});
				continue;
			}

			if (!response.ok) {
				yield* discard(response);
				return yield* refuse("unreachable");
			}

			return yield* readCapped(response);
		}
	}).pipe(
		// Wraps the read as well as the connect: a host that sends headers and
		// then drips one byte an hour holds the request open just as effectively
		// as one that never answers.
		Effect.timeoutFail({
			duration: FETCH_TIMEOUT,
			onTimeout: () => new ImageFetchRefused({ reason: "timeout" }),
		}),
	);

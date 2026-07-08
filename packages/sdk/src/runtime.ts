import { FetchHttpClient, HttpApiClient } from "@effect/platform";
import { Api as Contract } from "@mamen/shared/contract";
import { Cause, Effect, Exit, ManagedRuntime } from "effect";

/**
 * Base URL for the API. Reads Vite's `VITE_API_URL` when present (browser
 * build), otherwise falls back to the same-origin `/api` prefix.
 */
const baseUrl =
	(typeof import.meta !== "undefined" &&
		(import.meta as { env?: Record<string, string> }).env?.VITE_API_URL) ||
	"";

/**
 * The derived, fully-typed HTTP client, held as an Effect service so it is
 * constructed once when the runtime first builds this layer.
 */
export class Client extends Effect.Service<Client>()("sdk/Client", {
	effect: HttpApiClient.make(Contract, { baseUrl }),
	dependencies: [FetchHttpClient.layer],
}) {}

/** Module-scope runtime; the layer is built lazily and memoized. */
const runtime = ManagedRuntime.make(Client.Default);

/**
 * Run a client effect to a Promise, unwrapping the Effect failure so
 * react-query sees the real tagged error rather than a `FiberFailure`.
 */
export const runQuery = <A, E>(
	effect: Effect.Effect<A, E, Client>,
	signal?: AbortSignal,
): Promise<A> =>
	runtime.runPromiseExit(effect, signal ? { signal } : undefined).then(
		Exit.match({
			onSuccess: (a) => a,
			onFailure: (cause) => {
				throw Cause.squash(cause);
			},
		}),
	);

import {
	HttpApiBuilder,
	HttpApiClient,
	HttpBody,
	HttpClient,
} from "@effect/platform";
import { NodeHttpServer } from "@effect/platform-node";
import { afterEach, assert, describe, it } from "@effect/vitest";
import {
	AI_PROVIDERS,
	Api,
	SECRET_HINT_MIN_LENGTH,
	SECRET_MIN_LENGTH,
	SecretRejected,
} from "@mamen/shared/contract";
import { Effect, Layer } from "effect";
import { ApiLive } from "../api-live";
import { DatabaseTest } from "../db/test";
import { ClaudeCodeStub } from "../import/test";
import { OutboundStub } from "../net/test";

/**
 * Storing one encrypted credential, end to end (issue #117) — the whole path
 * through the real HTTP client over the full API, against a fresh `:memory:`
 * database per test.
 *
 * The security properties here are behavioural, so they are asserted as
 * behaviour rather than left to a code review: the **raw response body** is
 * checked not to contain the pasted key, and a refusal is checked not to quote
 * the value it refused. Both read the bytes the client received, not the decoded
 * object, because the decoded object is exactly where a leak would *not* show.
 */

const HttpLive = HttpApiBuilder.serve().pipe(
	Layer.provide(ApiLive),
	Layer.provide(ClaudeCodeStub),
	Layer.provide(OutboundStub),
	Layer.provide(DatabaseTest),
	Layer.provideMerge(NodeHttpServer.layerTest),
);

const KEY = "a".repeat(64);
const ROTATED_KEY = `${"b".repeat(63)}c`;

/** A plausible vendor credential — long enough to earn a hint. */
const SECRET = "sk-ant-api03-Kj28fnQ2xLmPqR7v-3f9";

/**
 * The encryption key reaches the repository through the *server's* fiber, so
 * `Effect.withConfigProvider` around a request would never be seen — the
 * environment is what the running server reads, and setting it per test is what
 * lets one suite cover both the configured and the rotated case.
 */
const useKey = (key: string) => {
	process.env.TOKEN_ENCRYPTION_KEY = key;
};

afterEach(() => {
	delete process.env.TOKEN_ENCRYPTION_KEY;
});

describe("storing a credential", () => {
	it.effect("reports it configured, with a masked hint", () => {
		useKey(KEY);
		return Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const stored = yield* client.secrets.put({
				path: { name: "anthropic" },
				payload: { value: SECRET },
			});

			assert.strictEqual(stored.name, "anthropic");
			assert.isTrue(stored.configured);
			assert.strictEqual(stored.hint, "sk-ant-…3f9");
		}).pipe(Effect.provide(HttpLive));
	});

	it.effect(
		"never sends the key back — not on the store, not on a read",
		() => {
			useKey(KEY);
			return Effect.gen(function* () {
				const client = yield* HttpApiClient.make(Api);
				const http = yield* HttpClient.HttpClient;

				const stored = yield* http.put("/api/secrets/anthropic", {
					body: HttpBody.unsafeJson({ value: SECRET }),
				});
				const storedBody = yield* stored.text;
				assert.strictEqual(stored.status, 200);
				assert.notInclude(storedBody, SECRET);

				const read = yield* http.get("/api/secrets/anthropic");
				const readBody = yield* read.text;
				assert.notInclude(readBody, SECRET);
				// It is a status, and it did answer — not a body that happens to be
				// empty for some unrelated reason.
				assert.include(readBody, '"configured":true');

				// The decoded client sees the same thing the bytes do.
				const status = yield* client.secrets.status({
					path: { name: "anthropic" },
				});
				assert.notInclude(JSON.stringify(status), SECRET);
			}).pipe(Effect.provide(HttpLive));
		},
	);

	it.effect("replaces a stored credential when a new one is pasted", () => {
		useKey(KEY);
		return Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			yield* client.secrets.put({
				path: { name: "anthropic" },
				payload: { value: SECRET },
			});
			const replaced = yield* client.secrets.put({
				path: { name: "anthropic" },
				payload: { value: "sk-ant-api03-second-credential-b21" },
			});

			assert.strictEqual(replaced.hint, "sk-ant-…b21");
			const status = yield* client.secrets.status({
				path: { name: "anthropic" },
			});
			assert.strictEqual(status.hint, "sk-ant-…b21");
		}).pipe(Effect.provide(HttpLive));
	});

	it.effect("stores a short credential without ever hinting at it", () => {
		useKey(KEY);
		// Between the two constants: long enough to store, too short to hint.
		const short = "k".repeat(SECRET_HINT_MIN_LENGTH - 1);
		assert.isAtLeast(short.length, SECRET_MIN_LENGTH);
		return Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const stored = yield* client.secrets.put({
				path: { name: "anthropic" },
				payload: { value: short },
			});

			assert.isTrue(stored.configured);
			assert.isNull(stored.hint);
		}).pipe(Effect.provide(HttpLive));
	});
});

describe("refusing a paste", () => {
	it.effect("refuses a blank value with a reason code", () => {
		useKey(KEY);
		return Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const error = yield* client.secrets
				.put({ path: { name: "anthropic" }, payload: { value: "  \n " } })
				.pipe(Effect.flip);

			assert.ok(error instanceof SecretRejected);
			assert.strictEqual(error.reason, "blank");

			// Nothing was stored by a refused paste.
			const status = yield* client.secrets.status({
				path: { name: "anthropic" },
			});
			assert.isFalse(status.configured);
		}).pipe(Effect.provide(HttpLive));
	});

	it.effect("refuses a too-short value without quoting it back", () => {
		useKey(KEY);
		const stray = "sk-x1";
		assert.isBelow(stray.length, SECRET_MIN_LENGTH);
		return Effect.gen(function* () {
			const http = yield* HttpClient.HttpClient;
			const response = yield* http.put("/api/secrets/anthropic", {
				body: HttpBody.unsafeJson({ value: stray }),
			});
			const body = yield* response.text;

			assert.strictEqual(response.status, 422);
			assert.include(body, '"reason":"too-short"');
			// The refusal describes the paste; it does not repeat it.
			assert.notInclude(body, stray);
		}).pipe(Effect.provide(HttpLive));
	});
});

describe("a deployment with no usable encryption key", () => {
	/**
	 * DEPLOY.md and `config.ts` both promise this shape, so it is held here
	 * rather than left as prose: an unset `TOKEN_ENCRYPTION_KEY` is an operator
	 * fault, not a client one, so it is a 500 and *not* a `SecretRejected` the
	 * browser would render at the field as if the paste were bad.
	 *
	 * The body matters as much as the status. A defect's message reaches the
	 * response, so this is the one path where a leak would arrive by way of an
	 * error rather than a success shape.
	 */
	it.effect("refuses to store, as a 500 that names no value", () => {
		// Deliberately not `useKey` — this is the unset case.
		return Effect.gen(function* () {
			const http = yield* HttpClient.HttpClient;
			const response = yield* http.put("/api/secrets/anthropic", {
				body: HttpBody.unsafeJson({ value: SECRET }),
			});
			const body = yield* response.text;

			assert.strictEqual(response.status, 500);
			assert.notInclude(body, SECRET);
			assert.notInclude(body, "SecretRejected");

			// And it stored nothing: a failed encrypt must not leave a row behind
			// that would then read back as present-but-unreadable forever.
			const client = yield* HttpApiClient.make(Api);
			const status = yield* client.secrets.status({
				path: { name: "anthropic" },
			});
			assert.isFalse(status.configured);
		}).pipe(Effect.provide(HttpLive));
	});

	it.effect("refuses a blank paste before it ever needs the key", () => {
		// The reason code is a property of the value, so it is decided without
		// reference to the deployment: a user pasting nothing is told they pasted
		// nothing, whether or not the operator configured a key.
		return Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const error = yield* client.secrets
				.put({ path: { name: "anthropic" }, payload: { value: "" } })
				.pipe(Effect.flip);

			assert.ok(error instanceof SecretRejected);
			assert.strictEqual(error.reason, "blank");
		}).pipe(Effect.provide(HttpLive));
	});
});

describe("reading the status", () => {
	it.effect("reports absent when nothing is stored", () => {
		useKey(KEY);
		return Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			const status = yield* client.secrets.status({
				path: { name: "anthropic" },
			});

			assert.strictEqual(status.name, "anthropic");
			assert.isFalse(status.configured);
			assert.isNull(status.hint);
		}).pipe(Effect.provide(HttpLive));
	});

	it.effect(
		"reports configured with no hint when the stored value will not decrypt",
		() => {
			useKey(KEY);
			return Effect.gen(function* () {
				const client = yield* HttpApiClient.make(Api);
				yield* client.secrets.put({
					path: { name: "anthropic" },
					payload: { value: SECRET },
				});

				// The operator rotated TOKEN_ENCRYPTION_KEY. The blob is still
				// there and is now unreadable.
				useKey(ROTATED_KEY);
				const status = yield* client.secrets.status({
					path: { name: "anthropic" },
				});

				// Present but unreadable — *not* absent. Absent would tell the
				// operator nothing was ever stored, so they would never re-paste.
				assert.isTrue(status.configured);
				assert.isNull(status.hint);
			}).pipe(Effect.provide(HttpLive));
		},
	);
});

describe("clearing a credential", () => {
	it.effect("removes it, and clearing nothing is not an error", () => {
		useKey(KEY);
		return Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			yield* client.secrets.put({
				path: { name: "anthropic" },
				payload: { value: SECRET },
			});

			const cleared = yield* client.secrets.clear({
				path: { name: "anthropic" },
			});
			assert.isFalse(cleared.configured);
			assert.isNull(cleared.hint);

			const again = yield* client.secrets.clear({
				path: { name: "anthropic" },
			});
			assert.isFalse(again.configured);

			const status = yield* client.secrets.status({
				path: { name: "anthropic" },
			});
			assert.isFalse(status.configured);
		}).pipe(Effect.provide(HttpLive));
	});
});

/**
 * A credential for **every** provider (issue #118). The previous slice proved
 * the path for one name; what is new here is that the store is keyed by the
 * catalogue's provider set, that one request answers for all of them, and that
 * the security property holds per provider rather than for the one that
 * happened to be tested.
 */

/** A distinct plausible credential per provider — distinct heads and tails, so
 * a hint that came from the wrong row is visible rather than coincidentally
 * right. */
const secretFor = (provider: string) =>
	`sk-${provider}-api03-Kj28fnQ2xLmPqR7v-${provider.slice(0, 3)}`;

describe("a credential for every provider", () => {
	it.effect("stores, hints and clears each one independently", () => {
		useKey(KEY);
		return Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);

			for (const provider of AI_PROVIDERS) {
				const stored = yield* client.secrets.put({
					path: { name: provider },
					payload: { value: secretFor(provider) },
				});
				assert.strictEqual(stored.name, provider);
				assert.isTrue(stored.configured);
				assert.strictEqual(
					stored.hint,
					`${secretFor(provider).slice(0, 7)}…${provider.slice(0, 3)}`,
				);
			}

			// Clearing one leaves the others alone: the rows are per provider, and
			// revoking mamen's access to one vendor is not revoking it to all.
			yield* client.secrets.clear({ path: { name: "google" } });
			for (const provider of AI_PROVIDERS) {
				const status = yield* client.secrets.status({
					path: { name: provider },
				});
				assert.strictEqual(status.configured, provider !== "google");
			}
		}).pipe(Effect.provide(HttpLive));
	});

	it.effect("never sends any provider's key back", () => {
		useKey(KEY);
		return Effect.gen(function* () {
			const http = yield* HttpClient.HttpClient;

			for (const provider of AI_PROVIDERS) {
				const stored = yield* http.put(`/api/secrets/${provider}`, {
					body: HttpBody.unsafeJson({ value: secretFor(provider) }),
				});
				assert.strictEqual(stored.status, 200);
				assert.notInclude(yield* stored.text, secretFor(provider));

				const read = yield* http.get(`/api/secrets/${provider}`);
				assert.notInclude(yield* read.text, secretFor(provider));
			}

			// The one body that carries every provider at once is the one worth
			// checking against every key at once.
			const all = yield* http.get("/api/secrets");
			const body = yield* all.text;
			for (const provider of AI_PROVIDERS) {
				assert.notInclude(body, secretFor(provider));
			}
		}).pipe(Effect.provide(HttpLive));
	});
});

describe("the status of every provider at once", () => {
	it.effect("answers for the whole catalogue, in catalogue order", () => {
		useKey(KEY);
		return Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			yield* client.secrets.put({
				path: { name: "anthropic" },
				payload: { value: secretFor("anthropic") },
			});

			const statuses = yield* client.secrets.list();

			// Exhaustive, not "the ones with a row": a settings page renders the
			// providers mamen supports, so an absent credential is an entry that
			// says absent, not a missing entry.
			assert.deepStrictEqual(
				statuses.map((_) => _.name),
				[...AI_PROVIDERS],
			);
			const configured = statuses.filter((_) => _.configured);
			assert.deepStrictEqual(
				configured.map((_) => _.name),
				["anthropic"],
			);
			assert.strictEqual(configured[0]?.hint, "sk-anth…ant");
			for (const status of statuses.filter((_) => !_.configured)) {
				assert.isNull(status.hint);
			}
		}).pipe(Effect.provide(HttpLive));
	});

	it.effect("reports an unreadable credential as present, not absent", () => {
		useKey(KEY);
		return Effect.gen(function* () {
			const client = yield* HttpApiClient.make(Api);
			yield* client.secrets.put({
				path: { name: "openai" },
				payload: { value: secretFor("openai") },
			});

			useKey(ROTATED_KEY);
			const statuses = yield* client.secrets.list();
			const openai = statuses.find((_) => _.name === "openai");

			assert.isTrue(openai?.configured);
			assert.isNull(openai?.hint ?? null);
		}).pipe(Effect.provide(HttpLive));
	});
});

describe("an unknown provider id", () => {
	it.effect("is refused rather than stored", () => {
		useKey(KEY);
		const stray = "sk-mistral-api03-Kj28fnQ2xLmPqR7v-3f9";
		return Effect.gen(function* () {
			const http = yield* HttpClient.HttpClient;
			const response = yield* http.put("/api/secrets/mistral", {
				body: HttpBody.unsafeJson({ value: stray }),
			});
			const body = yield* response.text;

			// The name is a path param over a closed literal, so an unknown vendor
			// fails decode at the edge — a 400, not a row under a name nothing can
			// ever read back.
			assert.strictEqual(response.status, 400);
			assert.notInclude(body, stray);

			// And it wrote nothing: the catalogue still reports every provider
			// absent, and there is no fifth entry.
			const client = yield* HttpApiClient.make(Api);
			const statuses = yield* client.secrets.list();
			assert.strictEqual(statuses.length, AI_PROVIDERS.length);
			assert.isFalse(statuses.some((_) => _.configured));
		}).pipe(Effect.provide(HttpLive));
	});

	it.effect("cannot be read or cleared either", () => {
		useKey(KEY);
		return Effect.gen(function* () {
			const http = yield* HttpClient.HttpClient;
			const read = yield* http.get("/api/secrets/mistral");
			assert.strictEqual(read.status, 400);

			const cleared = yield* http.del("/api/secrets/mistral");
			assert.strictEqual(cleared.status, 400);
		}).pipe(Effect.provide(HttpLive));
	});
});

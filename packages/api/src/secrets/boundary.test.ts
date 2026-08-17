import { readdirSync, readFileSync, statSync } from "node:fs";
import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";
import { DatabaseTest } from "../db/test";
import * as barrel from "./index";

/**
 * The credential boundary, as a test (issue #117, ADR 0011).
 *
 * Two of the ticket's rules are architectural, so nothing in the wire suite can
 * fail when they are broken — a second decrypting module is perfectly good code
 * right up until the day it puts a plaintext key somewhere the first one never
 * would. They are held here instead:
 *
 * - **exactly one module decrypts**, so "where can a secret become readable" is
 *   answered by opening one file;
 * - **the plaintext reader is not on the module's barrel**, so importing it is a
 *   deliberate line rather than something that arrives with a convenience
 *   import.
 *
 * Paths are cwd-relative — vitest runs from the package root.
 */

/** The one module allowed to turn ciphertext back into a credential. */
const DECRYPTOR = "src/secrets/repository.ts";

/** The crypto leaf itself, and this file, both name what they guard. */
const EXEMPT = new Set([
	"src/crypto/aes-gcm.ts",
	"src/crypto/aes-gcm.test.ts",
	"src/secrets/boundary.test.ts",
]);

/** Every `.ts` file under `src`, as `[package-relative path, contents]`. */
function sources(dir = "src"): Array<[string, string]> {
	const out: Array<[string, string]> = [];
	for (const entry of readdirSync(dir)) {
		const path = `${dir}/${entry}`;
		if (statSync(path).isDirectory()) {
			out.push(...sources(path));
		} else if (entry.endsWith(".ts")) {
			out.push([path, readFileSync(path, "utf8")]);
		}
	}
	return out;
}

const files = sources();

describe("exactly one module decrypts", () => {
	it("no other module imports the decrypt function", () => {
		// The import, not the word: prose about a value that "will not decrypt"
		// is what the tests around this one are for.
		const importsDecrypt =
			/import\s*\{[^}]*\bdecrypt\b[^}]*\}\s*from\s*"[^"]*crypto\/aes-gcm"/;
		const importers = files
			.filter(([path]) => !EXEMPT.has(path))
			.filter(([, source]) => importsDecrypt.test(source))
			.map(([path]) => path);

		assert.deepStrictEqual(importers, [DECRYPTOR]);
	});

	it("no other module reads the encrypted_secrets table", () => {
		// A second reader of the table is a second decryptor waiting to happen:
		// the ciphertext is only useful to something that will decrypt it.
		const readers = files
			.filter(([, source]) => source.includes("encrypted_secrets"))
			.map(([path]) => path)
			.filter((path) => !path.endsWith(".test.ts"))
			.filter((path) => !path.startsWith("src/db/migrations/"));

		assert.deepStrictEqual(readers, [DECRYPTOR]);
	});
});

describe("the plaintext reader's in-process callers are named", () => {
	// The deep import is deliberate — that is the whole design — but it is only
	// meaningful while it stays rare enough to read. This names the callers, so a
	// third one has to be argued for in a diff rather than arriving with an
	// autocomplete. Test files are excluded: `repository.test.ts` reaches the
	// reader because it is the thing under test.
	//
	// Both are in the AI runner, and each spends a credential at exactly one
	// transport: `service.ts` hands a hosted vendor's key to the runner, and
	// `claude.ts` hands the Claude Code token to the CLI's config (issue #122 —
	// the token has no environment fallback, so this read is its only source).
	it("is imported by the two AI-runner transports and nothing else", () => {
		const importsReader =
			/import\s*\{[^}]*\breadSecret\b[^}]*\}\s*from\s*"[^"]*secrets\/repository"/;
		const importers = files
			.filter(([path]) => !path.endsWith(".test.ts"))
			.filter(([, source]) => importsReader.test(source))
			.map(([path]) => path)
			.sort();

		assert.deepStrictEqual(importers, [
			"src/ai-runner/claude.ts",
			"src/ai-runner/service.ts",
		]);
	});
});

describe("the plaintext reader is not on the barrel", () => {
	it("exports the outward surface and nothing else", () => {
		assert.deepStrictEqual(Object.keys(barrel).sort(), [
			"SecretsLive",
			"SecretsRepo",
		]);
	});

	it("does not re-export the reader", () => {
		assert.notProperty(barrel, "readSecret");
	});

	it.effect(
		"gives the outward repository no method that returns a secret",
		() =>
			Effect.gen(function* () {
				// The **built** service's public shape, as the handler layer sees it —
				// not a stand-in this test constructed, which would only assert its own
				// literal back. `status`, `statusAll`, `put` and `clear` all answer with
				// a `SecretStatus`; there is no fifth method for a plaintext to come
				// back through, which is what makes the group layer above structurally
				// unable to leak one.
				const repo = yield* barrel.SecretsRepo;

				assert.deepStrictEqual(Object.keys(repo).sort(), [
					"clear",
					"put",
					"status",
					"statusAll",
				]);
			}).pipe(
				Effect.provide(barrel.SecretsRepo.Default),
				Effect.provide(DatabaseTest),
			),
	);
});

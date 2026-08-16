import { assert, describe, it } from "@effect/vitest";
import {
	SECRET_HINT_MIN_LENGTH,
	SECRET_MIN_LENGTH,
} from "@mamen/shared/contract";
import { maskSecret } from "./mask";

/**
 * The **masked hint** (issue #117): first seven characters, `…`, last three —
 * enough to tell *which* of several keys is stored, and never enough to be one.
 *
 * The interesting case is the short key. `SECRET_MIN_LENGTH` and
 * `SECRET_HINT_MIN_LENGTH` are separate constants precisely so a credential
 * between them stores fine and shows nothing: ten characters of a twelve-
 * character key is not a hint, it is most of the key.
 */
describe("maskSecret", () => {
	it("shows the first seven and the last three", () => {
		assert.strictEqual(
			maskSecret("sk-ant-api03-secret-tail3f9"),
			"sk-ant-…3f9",
		);
	});

	it("shows nothing for a secret below the hint minimum", () => {
		assert.isNull(maskSecret("a".repeat(SECRET_HINT_MIN_LENGTH - 1)));
	});

	it("shows a hint at exactly the hint minimum", () => {
		const value = `abcdefgh${"x".repeat(SECRET_HINT_MIN_LENGTH - 11)}ij9`;
		assert.strictEqual(value.length, SECRET_HINT_MIN_LENGTH);
		assert.strictEqual(maskSecret(value), "abcdefg…ij9");
	});

	it("never shows more than ten characters of the secret", () => {
		// The property the two constants exist to guarantee, stated over every
		// length a stored secret can have: a hint is at most half of it.
		for (let length = SECRET_MIN_LENGTH; length <= 60; length++) {
			const hint = maskSecret("s".repeat(length));
			if (hint === null) continue;
			assert.strictEqual(hint.replace("…", "").length, 10);
			assert.isAtMost(hint.replace("…", "").length * 2, length);
		}
	});
});

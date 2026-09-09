import { assert, describe, it } from "@effect/vitest";
import { Option } from "effect";
import { decrypt, encrypt, keyFromHex } from "./aes-gcm";

/**
 * The AES-256-GCM utility, on its own (issue #117). It knows nothing about
 * secrets, names or storage — it turns a string into an opaque blob under a key
 * and back, and answers `none` for every way that can fail.
 *
 * The failures are the point. A blob under a rotated key, a blob whose bytes
 * were edited, and a blob that is not one at all must be indistinguishable to
 * the caller: all three are *unreadable*, and the caller's job is to report the
 * secret as present-but-unreadable rather than to explain which.
 */

/** 32 bytes of key, as the config entry carries it. */
const KEY_A = "a".repeat(64);
const KEY_B = `${"b".repeat(63)}c`;

const key = (hex: string) => Option.getOrThrow(keyFromHex(hex));

const SECRET = "sk-ant-api03-0123456789abcdef";

describe("keyFromHex", () => {
  it("accepts 64 hex characters", () => {
    assert.isTrue(Option.isSome(keyFromHex(KEY_A)));
  });

  it("is case-insensitive", () => {
    assert.deepStrictEqual(
      Option.getOrThrow(keyFromHex("A".repeat(64))),
      Option.getOrThrow(keyFromHex("a".repeat(64))),
    );
  });

  it("refuses a key of the wrong length", () => {
    assert.isTrue(Option.isNone(keyFromHex("a".repeat(62))));
    assert.isTrue(Option.isNone(keyFromHex("a".repeat(66))));
    assert.isTrue(Option.isNone(keyFromHex("")));
  });

  it("refuses a non-hex key of the right length", () => {
    // `Buffer.from(_, "hex")` truncates at the first non-hex pair rather than
    // throwing, so a key of 64 plausible-looking characters would otherwise
    // silently become a shorter one.
    assert.isTrue(Option.isNone(keyFromHex(`${"z".repeat(2)}${"a".repeat(62)}`)));
  });
});

describe("encrypt / decrypt", () => {
  it("round-trips a value", () => {
    const blob = encrypt(SECRET, key(KEY_A));
    assert.deepStrictEqual(decrypt(blob, key(KEY_A)), Option.some(SECRET));
  });

  it("round-trips non-ASCII", () => {
    const blob = encrypt("clé-privée-€-🔑", key(KEY_A));
    assert.deepStrictEqual(decrypt(blob, key(KEY_A)), Option.some("clé-privée-€-🔑"));
  });

  it("never puts the plaintext in the blob", () => {
    const blob = encrypt(SECRET, key(KEY_A));
    assert.notInclude(blob, SECRET);
    assert.notInclude(Buffer.from(blob, "base64").toString("latin1"), SECRET);
  });

  it("encrypts the same value to a different blob each time", () => {
    // A fresh IV per encryption: equal blobs would tell a reader of the
    // database file that two providers hold the same key.
    const first = encrypt(SECRET, key(KEY_A));
    const second = encrypt(SECRET, key(KEY_A));
    assert.notStrictEqual(first, second);
  });

  it("cannot read a blob under a different key", () => {
    const blob = encrypt(SECRET, key(KEY_A));
    assert.isTrue(Option.isNone(decrypt(blob, key(KEY_B))));
  });

  it("cannot read a blob whose ciphertext was edited", () => {
    const bytes = Buffer.from(encrypt(SECRET, key(KEY_A)), "base64");
    bytes[bytes.length - 1] ^= 0xff;
    assert.isTrue(Option.isNone(decrypt(bytes.toString("base64"), key(KEY_A))));
  });

  it("cannot read a blob whose IV was edited", () => {
    const bytes = Buffer.from(encrypt(SECRET, key(KEY_A)), "base64");
    bytes[0] ^= 0xff;
    assert.isTrue(Option.isNone(decrypt(bytes.toString("base64"), key(KEY_A))));
  });

  it("cannot read a blob that is too short to be one", () => {
    assert.isTrue(Option.isNone(decrypt("", key(KEY_A))));
    assert.isTrue(Option.isNone(decrypt(Buffer.alloc(20).toString("base64"), key(KEY_A))));
  });

  it("cannot read something that is not a blob", () => {
    assert.isTrue(Option.isNone(decrypt("not a blob at all", key(KEY_A))));
  });
});

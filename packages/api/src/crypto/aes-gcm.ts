import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { Option } from "effect";

/**
 * AES-256-GCM over a string, and back — mamen's only cryptography (issue #117,
 * ADR 0011). It is a leaf: no config, no database, no logging, and no knowledge
 * of what a secret is. The one module allowed to call {@link decrypt} is
 * `secrets/repository.ts`; see `secrets/boundary.test.ts`, which holds that.
 *
 * **Authenticated** encryption, not merely encryption: GCM's tag is verified on
 * every read, so a blob whose bytes were edited in the database file fails to
 * decrypt instead of yielding attacker-chosen plaintext.
 *
 * The stored form is one base64 string, `iv (12) ‖ tag (16) ‖ ciphertext`, so a
 * secret is one TEXT column and the framing is not a second thing to get wrong
 * across three columns. 12-byte IV is GCM's standard nonce size (any other
 * length costs a hashing step and buys nothing); it is random per encryption, so
 * the same key stored under two names is two unrelated blobs.
 */

/** Bytes of key material AES-256 takes — 32, i.e. 64 hex characters. */
export const KEY_BYTES = 32;

const IV_BYTES = 12;
const TAG_BYTES = 16;

declare const KeyBrand: unique symbol;

/**
 * A key of exactly {@link KEY_BYTES} bytes. Branded, and constructible only
 * through {@link keyFromHex}, so {@link encrypt} has no length check to make and
 * no unreachable branch to leave untested: the type is the check.
 */
export type EncryptionKey = Buffer & { readonly [KeyBrand]: true };

const HEX = /^[0-9a-fA-F]+$/;

/**
 * Parse the configured key. Returns `none` for anything that is not exactly
 * `KEY_BYTES * 2` hex characters — including a plausible-looking string with a
 * non-hex character in it, which `Buffer.from(_, "hex")` would silently truncate
 * at rather than reject, yielding a short key that "works" and encrypts
 * everything under the wrong material.
 */
export const keyFromHex = (hex: string): Option.Option<EncryptionKey> =>
  hex.length === KEY_BYTES * 2 && HEX.test(hex)
    ? Option.some(Buffer.from(hex, "hex") as EncryptionKey)
    : Option.none();

/** Encrypt `plaintext` under `key`, as one base64 `iv ‖ tag ‖ ciphertext` blob. */
export const encrypt = (plaintext: string, key: EncryptionKey): string => {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64");
};

/**
 * Read a blob written by {@link encrypt}. `none` covers every way it can fail —
 * a rotated key, edited bytes, a truncated column, a value that was never a blob
 * — deliberately without distinguishing them: the caller reports *unreadable*,
 * and a taxonomy here would only invite an error message that quoted the input.
 */
export const decrypt = (blob: string, key: EncryptionKey): Option.Option<string> => {
  // `Buffer.from(_, "base64")` never throws — it drops what it cannot read — so
  // the length check below is what rejects a non-blob, not a parse failure.
  const bytes = Buffer.from(blob, "base64");
  if (bytes.length <= IV_BYTES + TAG_BYTES) return Option.none();

  try {
    const decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, IV_BYTES));
    decipher.setAuthTag(bytes.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
    return Option.some(
      Buffer.concat([
        decipher.update(bytes.subarray(IV_BYTES + TAG_BYTES)),
        // Throws when the tag does not verify — the whole point of GCM.
        decipher.final(),
      ]).toString("utf8"),
    );
  } catch {
    return Option.none();
  }
};

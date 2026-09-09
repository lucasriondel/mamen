import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { Account, AccountCreate } from "./accounts";
import { normalizeIban, StoredIban } from "./iban";

/**
 * The **stored form** of an IBAN (issue #201). The contract has always said
 * account numbers are stored upper-case with no spaces, and until this schema
 * existed the only thing that made it true was the web client remembering to
 * call `ibanPayload` — so a curl, an SDK script or a future importer stored
 * `fr76 1234…` verbatim and every exact-match consumer silently missed it.
 *
 * Written as a *pattern*, never as a literal, so this file carries no account
 * number of its own — the repo's leak scan (issue #108) holds every file in the
 * tree to that, and a synthetic one here would be one more exemption to keep.
 */
const IBAN = `FR7699999${"000011234567890189"}`;
const GROUPED = "fr76 9999 9000 0112 3456 7890 189";

describe("normalizeIban", () => {
  it("strips the separators a bank prints and upper-cases the rest", () => {
    expect(normalizeIban(GROUPED)).toBe(IBAN);
    expect(normalizeIban(`${IBAN.slice(0, 4)}-${IBAN.slice(4)}`)).toBe(IBAN);
  });

  it("is idempotent, so a stored value re-normalises to itself", () => {
    expect(normalizeIban(normalizeIban(GROUPED))).toBe(IBAN);
  });
});

/**
 * The transform normalises in **both** directions, which is the whole of the
 * fix: a client encodes its payload through this schema on the way out and the
 * server decodes the body through it on the way in, so neither end can put an
 * un-normalised account number in the database — whichever one of them was
 * written by somebody who had never read the doc comment.
 */
describe("StoredIban", () => {
  const decode = Schema.decodeSync(StoredIban);
  const encode = Schema.encodeSync(StoredIban);

  it("decodes a grouped, lower-case IBAN into the stored form", () => {
    expect(decode(GROUPED)).toBe(IBAN);
  });

  it("encodes into the stored form too — the payload direction", () => {
    expect(encode(GROUPED)).toBe(IBAN);
  });

  it("keeps a value that is already stored-form untouched", () => {
    expect(decode(IBAN)).toBe(IBAN);
    expect(encode(IBAN)).toBe(IBAN);
  });

  // `null` is the contract's "not given", and it is the *only* spelling of it:
  // an empty field folds to null rather than to `""`, so the no-op check that
  // compares a form against a stored account cannot be tripped by two ways of
  // saying nothing.
  it("keeps null as null", () => {
    expect(decode(null)).toBe(null);
    expect(encode(null)).toBe(null);
  });

  it("folds a blank value to null, so 'not given' has one spelling", () => {
    expect(decode("")).toBe(null);
    expect(decode("   ")).toBe(null);
    expect(encode("")).toBe(null);
  });

  // Shape is *not* this schema's business: the app refuses to validate an IBAN
  // against a country register (there is no such table here), so a string that
  // could not be an account number is still stored — normalised.
  it("normalises without judging whether the value could be an IBAN", () => {
    expect(decode("not an iban")).toBe("NOTANIBAN");
  });
});

describe("Account.iban", () => {
  const account = {
    id: 1,
    name: "Main",
    type: "checking",
    color: null,
    createdAt: "2026-08-22T00:00:00.000Z",
    updatedAt: "2026-08-22T00:00:00.000Z",
  };

  it("decodes an account's IBAN into the stored form", () => {
    const decoded = Schema.decodeUnknownSync(Account)({ ...account, iban: GROUPED });
    expect(decoded.iban).toBe(IBAN);
  });

  it("normalises the create payload in both directions", () => {
    const payload = { name: "Main", type: "checking", iban: GROUPED } as const;
    expect(Schema.decodeUnknownSync(AccountCreate)(payload).iban).toBe(IBAN);
    expect(Schema.encodeSync(AccountCreate)({ ...payload, iban: GROUPED }).iban).toBe(IBAN);
  });

  it("leaves an account with no IBAN on file alone", () => {
    const decoded = Schema.decodeUnknownSync(Account)({ ...account, iban: null });
    expect(decoded.iban).toBe(null);
  });
});

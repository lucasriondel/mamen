# ADR 0011 — Credentials are encrypted at rest, and leave the server only as a status

**Status**: accepted (issue #117, PRD #115)
**Supersedes**: nothing. **Amends**: nothing yet — ADR 0005's
`CLAUDE_CODE_OAUTH_TOKEN` still comes from the environment; moving it into this
store is a later slice of PRD #115.

## Context

mamen is about to let a user paste an API key for an AI provider, so that
extraction spends *their* quota at *their* chosen vendor rather than the one
credential baked into the API process's environment. That means mamen has to
hold a secret it did not issue, on behalf of someone who cannot inspect how it
is held.

Two things about the shape of this install make the question sharper than it
looks. The store is a **local sqlite file** — one file that gets copied to a
backup, a laptop, a volume snapshot — and the app is a **browser SPA**, so
anything the server is willing to say about a credential is one `fetch` away
from any script running on that page.

The contract already had a version of this and it was wrong: `LlmSettings.apiKey`
is a plain string on `AppSettings`, which `GET /app-settings` hands back to any
client that asks. Nothing reads it, which is the only reason it has not leaked.
PRD #115 deletes it rather than extending it.

## Decision

**Credentials are stored encrypted, and there is exactly one direction each way
across the boundary.**

- **Outward** — to HTTP handlers, the SDK and the browser — a credential is a
  `SecretStatus`: a boolean and a masked hint. Never the secret, and never the
  ciphertext. No endpoint anywhere can return a stored value, because the
  outward repository has no method that returns one.
- **Inward** — to an in-process caller about to spend the credential at a vendor
  — the plaintext, through `readSecret`, which is deliberately **not** on the
  secrets module's barrel. Reaching it takes a deep import that says what it is
  doing and shows up in a review.

`secrets/repository.ts` is **the only module that decrypts**, so "where can a
secret become readable" is answered by opening one file. `secrets/boundary.test.ts`
holds that: no other module imports `decrypt`, no other module reads the
`encrypted_secrets` table, and the barrel exports the outward surface and
nothing else.

The cipher is **AES-256-GCM** (`crypto/aes-gcm.ts`), with a random 12-byte IV
per encryption, stored as one base64 `iv ‖ tag ‖ ciphertext` blob. Authenticated,
not merely encrypted: a blob whose bytes were edited in the database file fails
to decrypt rather than yielding attacker-chosen plaintext. The key is
`TOKEN_ENCRYPTION_KEY` — 64 hex characters, no default.

## The threat model, stated plainly

The key sits in the API process's environment, next to the sqlite file it
protects. So:

**This defends against a leaked database file.** A copied `mamen.db`, a backup
that ended up somewhere it should not have, a volume snapshot, a disk pulled out
of a VPS — none of them carry the key, and the blobs in them are useless.

**This does not defend against an attacker who already has filesystem access to
the running host.** Such an attacker reads the environment of the process, and
the environment holds the key. Nothing in this design pretends otherwise, and
`TOKEN_ENCRYPTION_KEY` is not a second factor.

That is a real improvement over storing the key in plaintext — the *file* is the
thing that actually gets copied around — and it is not a claim of more.
OS-keychain storage for the key was considered and deferred as over-engineering
for a single-user local-first install; if it lands later, it changes where the
key comes from and nothing else.

## Masking, and why not truncation

The hint is **first seven characters, `…`, last three** (`sk-ant-…3f9`), and
there is **no hint at all** below `SECRET_HINT_MIN_LENGTH`.

The head alone identifies a vendor but not *which* of two keys from that vendor
is stored, which is the question the user is actually asking; the tail is what
they recognise against the vendor's own dashboard. Ten shown characters is a
useful answer for a 100-character key and most of a 12-character one — so the
minimum length a save accepts and the minimum a hint needs are **separate
constants**, and a credential between them stores fine and shows nothing. A hint
must never be able to become the credential.

## Unreadable is not absent

A stored blob that will not decrypt reports **configured with a `null` hint** —
present but unreadable — never absent.

This is the state a rotated or lost `TOKEN_ENCRYPTION_KEY` produces, and it is
the one failure here an operator can actually fix: re-paste the credential.
Reported as absent, they would be told nothing was ever stored and would have no
reason to. Rotation deliberately does not re-encrypt anything; there is no
migration path from an old key, because the old key is exactly what a rotation
assumes is compromised.

## A refusal carries a reason code, never the value

A paste that is blank or shorter than `SECRET_MIN_LENGTH` is refused with
`SecretRejected` — a `reason` literal and nothing else. The error type has no
field a value could travel in, so no HTTP response body, browser console or
intermediate log can end up holding the secret by way of an error message.

The minimum is generous and vendor-agnostic. A per-vendor prefix check
(`sk-ant-…`) would refuse a legitimate credential the day a vendor changes its
format, and the only honest test of a credential is a run.

For the same reason nothing here logs a secret: the inward reader hands back
`Redacted`, so even an accidental `Effect.log` prints `<redacted>`, and
`secrets/repository.test.ts` runs the whole store/read/clear cycle under a
capturing logger and asserts no line contains the value.

## Nothing is auto-imported

A migration that copied an existing environment credential into the new store
was rejected. It would leave that credential in two places, one of which looks
live and is not, and it would silently take a value the user never chose to give
to this store. miel's ADR 0001 made the same call. A user with a key in the old
place pastes it once.

## Considered options

**Plaintext in the database, protected by file permissions.** Rejected: the file
is the thing that travels. Backups and snapshots are the normal case, not the
attack.

**Storing the masked hint as a column** alongside the ciphertext. Rejected: a
stored hint keeps answering after the value behind it has become unreadable,
which hides precisely the state the operator most needs told. The hint is
derived on read, from the decrypted value, so it exists only when the credential
does.

**A `NotFound` when clearing a credential that was never stored.** Rejected:
clearing is idempotent because "there is no credential here" is the state the
caller asked for, and it holds either way.

**Distinguishing *unset key* from *wrong key* from *edited bytes*** in what the
API reports. Rejected: all three are one operational fact — the stored value is
unreadable — and a taxonomy invites an error message that describes the key.

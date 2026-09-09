# Security

## Reporting a vulnerability

Email **lucasrndl@gmail.com** with `mamen security` in the subject. Please don't
open a public GitHub issue for anything exploitable.

Useful things to include: what an attacker can do, the steps to reproduce it,
and the version or commit you tested. If you need to attach data from a real
statement, redact the account numbers and counterparty names first — this
project exists precisely to avoid spreading those around.

## What you can expect

This is a personal project maintained by one person in their spare time. Being
honest about that up front:

- **No bounty.** There is no money, and there is no budget from which to invent
  any.
- **No security team.** One maintainer, best effort.
- **Acknowledgement within about a week**, and an honest answer about whether and
  when it will be fixed. "Won't fix, here's why" is a possible answer — see the
  known limitations below, several of which are deliberate.
- Credit in the fix commit if you'd like it, and no objection to you disclosing
  publicly once a fix has shipped or once it's clear one isn't coming.

## What an instance holds

Treat a running instance as holding a complete picture of someone's finances:

- **Transaction history** — every row from every imported statement: date,
  amount, account, the raw counterparty string the bank supplied, plus whatever
  notes and categorisation the user has added. This is the whole database, and it
  is one SQLite file (`DB_PATH`, `mamen.db` by default, plus its `-wal` and
  `-shm` companions).
- **Bank statement contents.** Imported CSVs are parsed in the browser and only
  the resulting rows are sent to the API — but those rows *are* the statement.
  Uploaded PDFs are staged in a server-side temp directory and deleted after
  extraction; they are not stored.
- **Uploaded issuer images**, on disk under `UPLOADS_DIR`, served unauthenticated
  from `/uploads/*`.

Two outbound flows carry data off the machine:

- **PDF import** hands the uploaded statement to the `claude` CLI, which sends
  its contents to Anthropic's API for extraction. If that is not acceptable for
  your data, don't import PDFs; CSV import never leaves your browser and your own
  server.
- **Logo search** (optional, only when `LOGODEV_TOKEN` is set) sends issuer names
  to logo.dev to find an image. Outbound fetches are SSRF-guarded — the resolved
  address is checked before the request is made.

Backups deserve the same care as the instance: `mamen.db*` and the uploads
directory together are the entire dataset in plaintext.

## Known limitations, by design

These are not vulnerabilities to report — they are how the app is built, and
each is written down elsewhere too:

- **There is no authentication.** None. Every route is open to whoever can reach
  the server, including `POST /api/database/reset` and `POST
  /api/database/import`, which respectively wipe and replace the whole database.
  mamen is meant to sit behind something that authenticates for it — the
  deployment described in [DEPLOY.md](DEPLOY.md)
  puts the app (`/app`) and the API (`/api`, `/uploads`) behind Cloudflare
  Access and gives the API container no public domain of its own. Only the site
  root — one prerendered landing page, served by a different container that
  proxies nothing — is public. **If you expose an instance directly to the internet,
  it is world-readable and world-destroyable.** That is on the deployment, not on
  the code.
- **There is no encryption at rest.** The SQLite file is plaintext.
- **It is single-user.** There are no accounts, no roles and no per-user
  separation, so there is no privilege boundary inside the app to escalate
  across.

What *is* worth reporting, given all that: anything that lets a third party reach
data without going through whatever you put in front of the app — an SSRF that
escapes the outbound guard, a path traversal out of the uploads directory, SQL
injection, a way to make the server write outside its data directory, or a
dependency with a known exploited vulnerability that mamen actually reaches.

# Setting up Logo search

**Logo search** lets you pick an issuer's image by name instead of uploading a
file: the API asks [logo.dev](https://logo.dev)'s Logo API whether it knows the
brand, offers the logo on three backgrounds (auto / light / dark), and a second
call downloads whichever variant you picked and stores it as that issuer's
image. See
[ADR 0007](../adr/0007-issuer-images-are-normalised-search-is-server-side.md)
for why the lookup runs on the server and what else was considered — the ADR
was written against Google Programmable Search, which retired whole-web
engines for new accounts in January 2026; logo.dev replaced it.

It is **off until you configure it**. With no token the endpoint answers with a
distinct *unconfigured* state naming the variable it wants, and the UI explains
what to set — nothing 500s and no lookup is spent. The rest of the app works
exactly as before; only this one feature is inert.

> [!WARNING]
> **Do not deploy this publicly.** Both endpoints are **unauthenticated**, like
> the rest of the API today. That means anyone who can reach the server can
> spend your logo.dev rate budget, and can ask the server to fetch arbitrary
> URLs on their behalf. Authentication and rate-limiting are deliberately
> deferred (ADR 0007) and **must land before the app is exposed to the
> internet**. Until then, run it on localhost or a private network only. The
> [SSRF guards](#what-the-download-endpoint-refuses) below bound the damage of
> the fetch endpoint; they are not a substitute for auth.

## The one value

| Variable | What it is | Secret? |
| --- | --- | --- |
| `LOGODEV_TOKEN` | Your logo.dev **publishable key** (`pk_…`) | No — logo.dev designs it to appear in `<img>` tags. It still lives in the API process only, so configuration has one home and the client stays provider-agnostic. |

It is read by `packages/api/src/config.ts` from the API process's environment,
per request. It has no default: unlike `DB_PATH` or `CORS_ORIGINS` there is no
harmless guess.

Setting it to the empty string counts as **not set**: `LOGODEV_TOKEN=` in an
env file reports as unconfigured rather than being sent to logo.dev to be
rejected with a confusing 401.

## Getting it

1. Sign up at <https://www.logo.dev> and open the
   [dashboard](https://www.logo.dev/dashboard).
2. Copy the **publishable key** (`pk_…`) — that is your `LOGODEV_TOKEN`.
   The secret key (`sk_…`) is not used: this app only calls the image CDN
   (`img.logo.dev`), never the secret-key APIs.

Note on attribution: logo.dev's free tier requires an attribution link for
**commercial** use; personal projects are exempt. If this app ever ships
commercially, revisit — see <https://www.logo.dev/docs> ("Attribution").

## Where the value goes

Local dev — export it into the shell that runs `bun dev`, or put it in the
local `.env` you already source for `CLAUDE_CODE_OAUTH_TOKEN` (see
[the `claude` CLI dependency doc](./claude-cli-dependency.md)):

```sh
export LOGODEV_TOKEN=<your-pk-key>
```

Deploy — set it as an environment variable on the API service, alongside
`DB_PATH`, `CORS_ORIGINS` and the rest of `packages/api/src/config.ts`. Unlike
`CLAUDE_CODE_OAUTH_TOKEN`, it is read **per request**, not at layer build: a
missing value degrades this one feature rather than stopping the server from
booting. (Subject to the deployment warning above.)

Tests never read the real environment for this.

## How a "search" works

logo.dev is not a search engine — `img.logo.dev/name/<query>` resolves a brand
name to *one* logo, served from a CDN. So a search costs exactly **one**
upstream request: a probe with `fallback=404`, which distinguishes "no logo for
this name" (a plain 404 → "No logos found" in the UI) from logo.dev's default
behaviour of answering unknown names with a 200 monogram placeholder. If the
name resolves, the mosaic offers the same logo rendered on three backgrounds
(`theme=auto`, `light`, `dark`); the variants share the probe's answer.

The app still spends lookups conservatively (the endpoint is rate-limited, and
the popover's caching predates the provider swap):

- A search fires **only on explicit submit** — never per keystroke.
- Opening the picker pre-fills the query with the issuer's **bare name** (no
  "logo" suffix — logo.dev matches brand names) and focuses the search button.
- An identical query re-uses the cached answer; re-opening the popover is free.
- Rate-limit exhaustion (an upstream 429) is reported as **its own error**,
  never as a generic failure — nothing in the UI suggests that retrying
  immediately might work.

## What the download endpoint refuses

`POST /issuers/:id/image/from-url` fetches a URL **from inside the network the
API runs in**, which makes it a server-side request forgery (SSRF) sink. That
the URL came from a search result is not a defence, because the endpoint is
reachable without doing any search. The guards are therefore on the fetch
itself:

- **HTTPS only.** `http:` is refused rather than silently upgraded, and so are
  `file:`, `ftp:` and `data:`.
- **The resolved address is checked before connecting** — private, loopback,
  link-local, unique-local, carrier-grade NAT, multicast and reserved ranges are
  all refused. `169.254.169.254`, the cloud metadata endpoint, is the target
  this matters most for. *Every* address a name resolves to must be acceptable,
  not just the first.
- **Redirects are capped at 3, and re-checked at every hop** — a permitted host
  is otherwise free to redirect the server inward.
- **A 2 MiB response cap**, enforced *while* the body streams, so an endless
  response is abandoned rather than buffered.
- **A 10 second timeout** covering the read as well as the connect, so a host
  that drips one byte at a time cannot hold a request open.

A refusal comes back as `ImageFetchRefused` with a reason, so the UI can say
*why* rather than "failed".

One known limitation: the address checked and the address the platform `fetch`
eventually connects to come from two separate DNS resolutions, so a **DNS
rebinding** attack — a name whose answer changes in between — can slip past.
Closing it requires connecting to the vetted IP directly while carrying the
hostname in `Host` and TLS SNI, which the platform `fetch` does not expose. The
byte cap, the timeout and HTTPS-only all still apply, and the attacker must
already know an internal address worth reaching.

Downloaded images go through exactly the same normalisation as uploads — 128×128
cover-cropped WebP, original discarded — so a searched image and an uploaded one
are byte-identical in form. Every result URL carries `fallback=404`, so picking
a result whose logo has since vanished upstream is refused (`unreachable`)
rather than silently storing a monogram placeholder.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| UI says Logo search is not configured | `LOGODEV_TOKEN` absent or empty in the **API process's** environment. Restarting the API after editing `.env` is enough; no rebuild needed. |
| "No logos found" for a brand that clearly exists | logo.dev's name resolution missed it. Try the exact brand name (no extra words — "Crédit Agricole", not "credit agricole logo"), or upload a file. |
| The mosaic shows the *wrong* brand's logo | Name resolution is fuzzy and lands on the closest domain it knows, so an obscure or misspelled name can resolve to a stranger. Refine the query; nothing is stored until a tile is picked. |
| "Rate limit reached" | logo.dev answered 429. It resets on its own; wait and retry, or upgrade the logo.dev plan. |
| A generic search failure mentioning 401 | The token is wrong or revoked. This is *not* the rate-limit case — the server distinguishes them. |
| A chosen image is refused | See the guards above; the reason on the error names which one fired. |

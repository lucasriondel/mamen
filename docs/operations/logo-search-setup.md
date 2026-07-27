# Setting up Logo search

**Logo search** lets you pick an issuer's image from Google image results
instead of uploading a file: the API queries Google's **Programmable Search**
JSON API, and a second call downloads whichever result you picked and stores it
as that issuer's image. See
[ADR 0007](../adr/0007-issuer-images-are-normalised-search-is-server-side.md)
for why the search runs on the server and what else was considered.

It is **off until you configure it**. With no credentials the endpoint answers
with a distinct *unconfigured* state naming the variables it wants, and the UI
explains what to set — nothing 500s and no query is spent. The rest of the app
works exactly as before; only this one feature is inert.

> [!WARNING]
> **Do not deploy this publicly.** Both endpoints are **unauthenticated**, like
> the rest of the API today. That means anyone who can reach the server can
> spend your entire daily quota, and can ask the server to fetch arbitrary URLs
> on their behalf. Authentication and rate-limiting are deliberately deferred
> (ADR 0007) and **must land before the app is exposed to the internet**. Until
> then, run it on localhost or a private network only. The
> [SSRF guards](#what-the-download-endpoint-refuses) below bound the damage of
> the fetch endpoint; they are not a substitute for auth.

## The two values

| Variable | What it is | Secret? |
| --- | --- | --- |
| `GOOGLE_CSE_KEY` | Google API key authorising Custom Search API calls | **Yes** — API-process only |
| `GOOGLE_CSE_CX` | The Programmable Search **engine id** (Google calls it `cx`) | No, but equally required |

Both are read by `packages/api/src/config.ts` from the API process's
environment, per request. Neither has a default: unlike `DB_PATH` or
`CORS_ORIGINS` there is no harmless guess.

`GOOGLE_CSE_KEY` never reaches the browser — keeping it out of the bundle is the
entire reason the search is proxied through the server rather than queried from
the client. A key shipped to a browser is a public key.

Setting a variable to the empty string counts as **not set**: `GOOGLE_CSE_KEY=`
in an env file reports as unconfigured rather than being sent to Google to be
rejected with a confusing 403.

## Getting them

### 1. Create a Programmable Search Engine (gives you `GOOGLE_CSE_CX`)

1. Go to <https://programmablesearchengine.google.com/controlpanel/all> and
   click **Add**.
2. Name it anything (e.g. `mamen logos`).
3. Under *What to search*, choose **Search the entire web**. An engine
   restricted to specific sites will find almost no logos.
4. Create it, then open its **Overview** / **Basics** page.
5. **Turn on _Image search_.** This is the step that is easy to miss: without
   it, the `searchType=image` requests this app makes return nothing useful,
   and the picker looks broken rather than misconfigured.
6. Copy the **Search engine ID** — that is your `GOOGLE_CSE_CX`.

### 2. Create an API key (gives you `GOOGLE_CSE_KEY`)

1. Go to <https://console.cloud.google.com/> and select or create a project.
2. Enable the **Custom Search API** for it
   (<https://console.cloud.google.com/apis/library/customsearch.googleapis.com>).
3. Under **APIs & Services → Credentials**, click **Create credentials → API
   key**.
4. Copy the key — that is your `GOOGLE_CSE_KEY`.
5. Recommended: **restrict** the key to the Custom Search API, so a leak
   cannot be spent on anything else.

## Where the values go

Local dev — export them into the shell that runs `bun dev`, or put them in the
local `.env` you already source for `CLAUDE_CODE_OAUTH_TOKEN` (see
[the `claude` CLI dependency doc](./claude-cli-dependency.md)):

```sh
export GOOGLE_CSE_KEY=<your-api-key>
export GOOGLE_CSE_CX=<your-engine-id>
```

Deploy — set both as environment variables on the API service, alongside
`DB_PATH`, `CORS_ORIGINS` and the rest of `packages/api/src/config.ts`. Unlike
`CLAUDE_CODE_OAUTH_TOKEN`, these are read **per request**, not at layer build:
a missing value degrades this one feature rather than stopping the server from
booting. (Subject to the deployment warning above.)

Tests never read the real environment for these.

## The daily limit

The free tier is **100 queries per day**, reset on Pacific time. After that
Google refuses every further query until the next day.

The app is shaped around that budget:

- A search fires **only on explicit submit** — never per keystroke, and not on
  a debounce. A search-as-you-type box would burn 100 queries in one sitting.
- Opening the picker pre-fills the query with `<issuer name> logo` and focuses
  the search button, so the common case costs exactly one query.
- Quota exhaustion is reported as **its own error** ("daily limit reached"),
  never as a generic failure — the fix is *wait until tomorrow, or enable
  billing*, and nothing in the UI should suggest that retrying might work.

Note that quota is per **API key**, not per engine, and that a spent free tier
answers with HTTP 403 rather than 429 — the server reads the response body to
tell "come back tomorrow" apart from "your key is wrong".

Paid usage is $5 per 1000 queries up to 10k/day, enabled by turning on billing
for the Cloud project.

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
are byte-identical in form.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| UI says Logo search is not configured | One or both variables absent or empty in the **API process's** environment. Restarting the API after editing `.env` is enough; no rebuild needed. |
| Search returns no results at all | *Image search* is off on the engine, or the engine is restricted to specific sites instead of the whole web. |
| "Daily limit reached" | The 100/day free tier is spent. It resets on Pacific time. |
| A generic search failure mentioning 403 | The key is wrong, restricted away from the Custom Search API, or the Custom Search API is not enabled on the project. This is *not* the quota case — the server distinguishes them. |
| A chosen image is refused | See the guards above; the reason on the error names which one fired. Some hosts also block server-side fetches outright, which surfaces as `unreachable`. |

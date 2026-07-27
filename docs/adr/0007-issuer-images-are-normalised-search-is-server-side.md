# Issuer images are normalised, search is server-side

An **Issuer** gets two new ways to acquire an image and one new guarantee about
what is stored. The guarantee: every image, however it arrives, is normalised to
**128×128 WebP, cover-cropped**, and the original is discarded. The two ways:
the existing manual upload, and a new **Logo search** that queries Google
Programmable Search from the server and stores the picked result.

When an issuer has no image at all, it falls back to its category's icon and
colour rather than to a letter.

## One stored form, both paths

The upload path stored whatever arrived, up to 2 MiB, untouched. Adding a second
path that downloads from the internet would have produced two classes of stored
image — one normalised, one not — and an uploads directory that grows without
bound. Both paths run the same pipeline instead, so "an issuer image" has exactly
one meaning on disk.

128×128 is sized from the render sites: avatars draw at 24px (`sm`) and 48px
(`lg`), so 128 covers 2× retina at the larger size with headroom. WebP because
every target browser takes it and it is materially smaller than PNG for logos.
Cover-crop because the avatar is a circle — letterboxing a wide logo into it
wastes the circle and looks accidental.

Resizing uses **sharp**. It is a native binary, which means the build must match
the deploy target's platform; that cost is paid once in a Dockerfile and buys an
order of magnitude over the WASM encoders.

## The search runs on the server, and it is a fetch sink

Google's Programmable Search JSON API needs an API key, so the query cannot run
in the browser without shipping the key to it. A server endpoint proxies the
search, and a second server call downloads the chosen result.

That download takes a URL and fetches it **from inside the network the API runs
in** — a textbook SSRF sink. Constraining results to what Google returned is not
a defence, because the endpoint is reachable independently of any search. The
guards are therefore on the fetch itself: HTTPS only, DNS resolved and checked
against private, loopback, link-local and unique-local ranges before connecting,
redirects capped and re-checked at each hop, a response byte cap, and a timeout.

These are necessary but not sufficient for a public deployment. The endpoint is
unauthenticated, like the rest of the API, so once deployed it is an open proxy
that spends the owner's quota. **Auth and rate-limiting are explicitly deferred**
and must land before the app is exposed.

## The free tier shapes the interaction

Google Programmable Search gives 100 queries/day free and then refuses for the
rest of the day. A search-as-you-type box would exhaust that in one sitting, so
**search fires only on explicit submit** — never on keystroke, and not on a
debounce, which bounds rate but not total spend. Opening the popover pre-fills
the query with `<issuer name> logo` and focuses the search button, so the common
case is one keypress and one query. Quota exhaustion is reported as itself
("daily limit reached"), not as a generic failure, because the fix is *wait or
pay* and nothing in the UI should suggest a retry would help.

## Considered options

**Scraping google.com/search?tbm=isch** was rejected: against Google's terms,
IP-blocked in practice, and breaks whenever the markup moves.

**Clearbit / Brandfetch logo APIs** were rejected as the primary path despite
fitting logos better than image search: they are keyed by *domain*, and an issuer
here is a name off a bank statement, not a domain. They remain a good future
addition next to search, not instead of it.

**Keeping the original alongside the resized copy** was rejected: nothing reads
it, and it reintroduces the unbounded uploads directory the normalisation exists
to prevent.

**A letter fallback for issuers with no category** was rejected outright, not kept
as a last resort. It contradicted the whole point of the chain: a screen of
imageless issuers should be scannable by category, and a wall of initials is not —
worse, an `S` and a `Sp` read as related when nothing about them is. The last
resort is a single neutral grey `?`, identical for every issuer that reaches it,
which says "nothing is known here" rather than restating the name beside it.

**Stroking the category glyph in the resolved colour**, over the avatar's usual
neutral chip, was rejected in favour of filling the chip with that colour and
drawing the glyph in a contrasting ink. Filling groups an issuer with its folder
siblings at a distance, which stroking a 14px outline does not; and it makes
legibility theme-independent, because both sides of the contrast pair are then
fixed colours. Stroked, the pair would be the category colour against a theme
token — a check that has to be re-run per theme, and that the seeded yellow fails
in light mode.

**Treating the grey `?` as the chain's default**, reached whenever no category
identity resolves, was rejected in favour of holding a fourth, drawn-empty state
while the category read is in flight. The `?` is an assertion — "nothing is known
about this issuer" — and a pending tree is not that; it is the same missing id as
a deleted category, distinguishable only by query status. Collapsing the two made
a grid of imageless issuers pop from a wall of `?` to a wall of colour on every
load, having been wrong about each one. The avatar therefore owns the grey rung,
not the resolver: it reserves the chip and draws nothing until the answer lands,
the same call `CategoryIcon` already makes for an icon chunk still loading.

## Consequences

- **sharp** joins the API's dependencies, and any container build must produce a
  matching native binary.
- **Two new endpoints** on the issuers group: a search proxy and a
  fetch-and-store. Both need `GOOGLE_CSE_KEY` and `GOOGLE_CSE_CX` in config;
  absent them, the feature reports itself unconfigured rather than erroring.
- **The 2 MiB upload cap stays** as a pre-resize guard — it bounds what sharp is
  asked to decode, which is the actual denial-of-service concern.
- **The avatar fallback chain becomes** image → the issuer's category icon on its
  resolved colour → a neutral grey `?`. The grey state is presentational, not the
  seeded *Uncategorised* category: an issuer with no category at all renders it
  without any lookup.
- **Copyright is accepted, not solved.** Storing logos fetched from image search
  is defensible for a single-user personal ledger and is not a position this
  project can hold once it serves other people.

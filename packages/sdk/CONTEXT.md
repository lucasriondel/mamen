# sdk — glossary

The typed client derived from the contract (`@mamen/shared`), wired to TanStack
Query. One `HttpApiClient` built from the contract's `Api` value, plus — per
resource — a **query-key factory**, **read options** and **mutation functions**.

Nothing here renders and nothing here is React-specific beyond the query layer:
`@tanstack/react-query` is a **peer** dependency, and `@mamen/web` is the only
consumer today. There are no hand-written `fetch` calls, no URL strings and no
response parsing — an endpoint added to the contract is callable here with no
code.

See [CONTEXT-MAP.md](../../CONTEXT-MAP.md) for cross-context terms (**Issuer**,
**Recap**, **Bundle**, …) and [`packages/shared/CONTEXT.md`](../shared/CONTEXT.md)
for the contract vocabulary these modules mirror (**group**, **filter set**,
**paged envelope**, **domain error**).

## Language

**Derived client**:
`HttpApiClient.make(Contract, { baseUrl })`, held as the `Client` Effect service
(`runtime.ts`) so it is constructed once. Every call is
`client.<group>.<endpoint>({ path, payload, urlParams })`, fully typed off the
contract in both directions — the request encodes and the response decodes
through the same schemas the server used. `baseUrl` reads Vite's `VITE_API_URL`
when present and otherwise falls back to the same-origin `/api` prefix, which is
the only environment knob in the package.
_Avoid_: API client, wrapper (nothing is wrapped — the client is generated from
the contract).

**Module runtime**:
The single `ManagedRuntime` in `runtime.ts`, built lazily and memoized at module
scope. One runtime for the whole app, not one per query.

**`runQuery`**:
The Effect→Promise bridge every query and mutation goes through. Two jobs, both
load-bearing: it **squashes the `Cause`**, so react-query's `error` is the real
tagged **domain error** (`NotFound`, `TransferInvalid`, `BundleInvalid`, …) that
a caller can `switch` on, rather than an opaque `FiberFailure` wrapping it; and
it threads react-query's `AbortSignal` into the run, so an unmounted or
superseded query actually cancels its request.

**Query-key factory**:
`xxxKeys` — the key hierarchy for one resource: `all` → `lists()` →
`list(params)`, and `details()` → `detail(id)`. Params are part of the key, so
two different filters are two different cache entries. The factory exists so a
caller invalidates by *naming a family* (`xxxKeys.all`) instead of reconstructing
a key by hand.
_Avoid_: cache key, query id.

**Read options**:
`xxxQueries` — plain `queryOptions(...)` values, never hooks. The caller passes
one to `useQuery`, which is what keeps this package free of React and lets the
same options be prefetched, suspended on, or read from the cache directly.

**Mutation function**:
`xxxMutations` — bare `mutationFn`s returning a Promise, not bound to any
`QueryClient`. **The SDK is invalidation-agnostic: the caller owns
invalidation.** That is a deliberate split, and the rule to remember when a write
here changes something a *different* resource counts — a derived count is a
function of the table a mutation just moved rows in, so the write's caller must
name every query family it invalidated, not just the obvious one.

**Params type**:
The SDK's own `XxxListParams` / `RecapParams` / `BundleImpactParams` — the
contract's **filter set** restated with every field optional, so a caller passes
only what it filters on. The decoded contract params are *required* (pagination
has a server default that a decoded type cannot express), so the query fills them
from `PaginationDefaults` before the call. These types are the SDK's, but they
mirror the contract's filters exactly and are not a place to invent a filter the
server does not implement.

**Resolution read**:
An endpoint that asks for exactly the rows a surface needs to *name*, keyed by
the ids on screen (`issuerQueries.byIds`), as opposed to a paginated `list` the
caller hopes contains them. The distinction has a bug behind it: `list` pages by
id, so a freshly created issuer sorted last off the page and the row pointing at
it rendered as unresolved. A resolution read has no page to fall off.
`issuerQueries.all` is the third shape — every issuer in one query, for the
pickers that offer a choice among all of them, bounded by `ISSUER_SCAN_LIMIT`.

## Testing

There are no unit tests in this package (`passWithNoTests` is on). The client,
the **module runtime** and the encode/decode path are exercised end-to-end by
`@mamen/api`'s wire suites, which drive the same derived client against a real
server; the query-key and params layers are exercised by `@mamen/web`'s feature
tests. Unit coverage is added here if the package ever grows logic of its own —
today it has none that isn't derived.

<!-- Terms are added here as they are resolved during design. -->

# Effect HttpApi stack survey

Research asset for [Survey the Effect HttpApi stack](../issues/0002-survey-effect-httpapi-stack.md), part of the [Effect API rework](../issues/0001-effect-api-rework.md) map.

Surveyed 2026-07-08. Primary source: local clone of the Effect monorepo at `~/.effect` (main @ `d24511f`, 2026-07-08 — matches all published latest versions), cross-checked against the npm registry and GitHub issues. Note: `effect.website/docs/platform/http-api/` 404s as of 2026-07; the maintained written reference for HttpApi is `~/.effect/packages/platform/README.md`.

## Versions and compatibility

Pinned versions (npm `latest` on 2026-07-08 — all released together from the Effect monorepo, mutually compatible):

| Package | Version | Peer requirements |
|---|---|---|
| `effect` | 3.21.4 | — (TS `^5.8.3` per monorepo; repo's 5.9.3 fine) |
| `@effect/platform` | 0.96.2 | effect `^3.21.4` |
| `@effect/platform-bun` | 0.90.0 | effect, @effect/platform, @effect/sql, @effect/rpc, @effect/cluster |
| `@effect/sql` | 0.51.1 | effect, @effect/platform, @effect/experimental `^0.60.0` |
| `@effect/sql-sqlite-bun` | 0.52.0 | effect, @effect/sql, @effect/platform, @effect/experimental |
| `@effect/vitest` | 0.29.0 | effect `^3.21.0`, **vitest `^3.2.0`** |
| `@tanstack/react-query` | 5.101.2 (latest; repo has ^5.90.21) | — |

Bun 1.3.4 is fine as runtime and package manager for all of the above. Note `@effect/platform-bun` pulls `@effect/rpc` + `@effect/cluster` as peers (bun auto-installs peers), and `@effect/sql` needs `@effect/experimental` — expect those in the lockfile.

### Gotcha 1: vitest 4 breaks @effect/vitest

`@effect/vitest@0.29.0` is a **hard runtime break** under vitest 4 (removed `ctx.onTestFinished`; every `it.effect` throws — Effect-TS/effect#5976, fix PR #5980 unmerged as of 2026-07-08). No stable @effect/vitest supports vitest 4. **Pin `vitest@3.2.4` + `@vitest/coverage-v8@3.2.4` in the new Effect packages**; `@mamen/web` can stay on vitest 4 (mixed majors per workspace package is fine — just don't share one root vitest config across both). Details in the Testing section.

### Gotcha 2: bun:sqlite vs Node-run vitest

Vitest runs on Node (even via `bunx vitest`), where `bun:sqlite` doesn't resolve; vitest under the Bun runtime is unsupported/flaky, and v8 coverage can't work under Bun at all. **Depend only on the `SqlClient.SqlClient` tag in app code; provide `@effect/sql-sqlite-bun` in prod (Bun runtime) and `@effect/sql-sqlite-node` (`:memory:`) in tests.** Details in the Testing section §6.

### Gotcha 3: Effect 4.0 is in beta

Effect 4.0 has been in very active beta since 2026-02-18 (94 betas; `4.0.0-beta.94` published 2026-07-07; no announced stable date). It restructures the ecosystem: `@effect/platform` is folded into core `effect` (HTTP router/multipart deps now in core), `@effect/sql` is restructured; `@effect/platform-bun` and `@effect/sql-sqlite-bun` continue with 4.0.0-beta lines. The effect-4-beta `@effect/vitest` supports vitest 4. **Everything in this survey documents the stable Effect 3.21 APIs** — building on the 4.0 beta instead is a separate decision (tracked as its own map ticket); choosing it would invalidate the import paths and some module layouts documented here.

### Key architecture confirmations (short form — detail in sections below)

- Contract lives cleanly in its own package: pure schema values, deps = `effect` + `@effect/platform` only. Feeds server, derived client, and OpenAPI.
- Server: `HttpApiBuilder.group` per group → `HttpApiBuilder.api` → `HttpApiBuilder.serve` on `BunHttpServer.layerConfig({ port: Config... })`, `BunRuntime.runMain`.
- Client: `HttpApiClient.make(Api, { baseUrl })` over `FetchHttpClient.layer` (no BunHttpClient exists; fetch works on Bun + browser). Typed errors decode to real instances; infrastructure errors are `RequestError | ResponseError | ParseError`, all `catchTag`-able.
- OpenAPI: `OpenApi.fromApi` is pure/sync → trivial committed-spec emit script; `HttpApiBuilder.middlewareOpenApi({ path })` serves it live; `HttpApiScalar.layer({ path })` for docs UI (self-contained, offline).
- Data: `SqliteClient.layer` (WAL default on), `Model.Class` + `Model.makeRepository` is the canonical repository pattern (but its methods `orDie` — write custom `SqlSchema` queries for typed errors), `SqliteMigrator.layer` runs migrations at startup, `sql.withTransaction` nests via savepoints. bun:sqlite: no `Date` binding (use ISO-TEXT/epoch-ms Model fields), booleans as 0/1, single semaphore-guarded connection.
- Testing: `it.effect` (TestClock frozen — use `it.live` or `TestClock.adjust` for time), `it.layer` for suite-shared layers, `layerTest` server layers (port 0 + wired HttpClient) make integration tests URL-free.
- tanstack-query: no canonical bridge; hand-roll module-scope `ManagedRuntime` + `runPromiseExit`/`Cause.squash` runner + per-resource `queryOptions`/key factories. Watch `effect-query` post-Effect-4.

## HttpApi contract definition

Verified against local Effect monorepo HEAD (`~/.effect`, matches @effect/platform 0.96.2). No `@deprecated` tags exist in any `HttpApi*.ts` or `platform-bun` file; git log since 2026-01-01 shows only version bumps on these files — the API surface is stable.

All contract modules come from `@effect/platform` (named module imports) plus `Schema` from `effect`:

```ts
import { HttpApi, HttpApiEndpoint, HttpApiError, HttpApiGroup, HttpApiSchema, OpenApi } from "@effect/platform"
import { Schema } from "effect"
```

The canonical style is class-based (gives the contract a nominal type, used in tests and `packages/platform-node/examples/api.ts`):

```ts
export class User extends Schema.Class<User>("User")({ id: Schema.Number, name: Schema.String }) {}

// Custom error: Schema.TaggedError + status annotation as 3rd argument
export class UserNotFound extends Schema.TaggedError<UserNotFound>()(
  "UserNotFound",
  { id: Schema.Number },
  HttpApiSchema.annotations({ status: 404 })
) {}

const idParam = HttpApiSchema.param("id", Schema.NumberFromString)  // packages/platform/src/HttpApiSchema.ts:270

export class UsersGroup extends HttpApiGroup.make("users")
  .add(
    HttpApiEndpoint.get("findById")`/${idParam}`   // path params via template-literal constructor
      .addSuccess(User)                            // status inferred: 200 (non-void), 204 (void)
      .addError(UserNotFound)                      // status 404 comes from the schema annotation
  )
  .add(
    HttpApiEndpoint.get("list", "/")
      .setUrlParams(Schema.Struct({                // query params; Encoded must be Record<string, string | string[] | undefined>
        query: Schema.optional(Schema.String),
        page: Schema.optionalWith(Schema.NumberFromString, { default: () => 1 })
      }))
      .addSuccess(Schema.Array(User))
  )
  .add(
    HttpApiEndpoint.post("create", "/")
      .setPayload(Schema.Struct({ name: Schema.String }))          // JSON request body
      .setHeaders(Schema.Struct({ "x-request-id": Schema.String })) // Encoded must be strings
      .addSuccess(User, { status: 201 })           // custom success status
  )
  .add(HttpApiEndpoint.del("remove")`/${idParam}`.addError(UserNotFound)) // no addSuccess => 204 empty
  .addError(HttpApiError.Unauthorized)             // group-level error, applies to all endpoints
  .prefix("/users")
  .annotateContext(OpenApi.annotations({ title: "Users" }))
{}

export class MyApi extends HttpApi.make("api")
  .add(UsersGroup)
  .addError(HttpApiError.InternalServerError)      // api-level error, applies to every endpoint
  .prefix("/v1")
{}
```

Key mechanics, cited:

- **Constructors**: `HttpApiEndpoint.get/post/put/patch/del/head/options(name, path)` or `(name)` followed by a path template literal (`packages/platform/src/HttpApiEndpoint.ts:918-996`). Template-literal params use `HttpApiSchema.param("id", schema)` where schema must encode to string; the path schema Struct is assembled automatically (`HttpApiEndpoint.ts:880-897`). Alternative: `.setPath(Schema.Struct({ id: ... }))` with a `"/users/:id"` path string.
- **Success status**: default success schema is `HttpApiSchema.NoContent` (204, `HttpApiEndpoint.ts:874,906`). `addSuccess(schema)` defaults to 200, or 204 if the schema is void (`HttpApiSchema.ts:190`). Override via `addSuccess(schema, { status: 201 })`. Prebuilt empty responses: `HttpApiSchema.Created` (201), `Accepted` (202), `NoContent` (204), or `HttpApiSchema.Empty(status)` (`HttpApiSchema.ts:307-395`). `HttpApiSchema.asEmpty({ status, decode })` maps an empty body to a typed value. Non-JSON responses: `HttpApiSchema.Text({ contentType })`, `HttpApiSchema.Uint8Array()`, `withEncoding({ kind: "UrlParams" | "Text" | "Uint8Array" | "Json" })` (`HttpApiSchema.ts:520-567`).
- **204 no-content**: simply omit `addSuccess`, or `addSuccess(HttpApiSchema.NoContent)`; handler returns `Effect.void`.
- **Payload on GET/HEAD**: for body-less methods `setPayload` reads from URL search params and must encode to strings (`HttpApiEndpoint.ts:606-612`, dispatch at `HttpApiBuilder.ts:555-557`). Multipart uploads: `setPayload(HttpApiSchema.Multipart(Schema.Struct({...})))`.
- **Errors**: `addError(schema, { status? })` exists at endpoint (`HttpApiEndpoint.ts:106`), group (`HttpApiGroup.ts:68`), and api (`HttpApi.ts:78`) level; group/api errors are unioned into every endpoint's error channel. Default error status is 500 (`HttpApiSchema.ts:202`). Status is attached either by `HttpApiSchema.annotations({ status })` on the schema (TaggedError third arg) or by the `{ status }` option at `addError` time. Built-ins in `HttpApiError` (`packages/platform/src/HttpApiError.ts:66-168`): `BadRequest` 400, `Unauthorized` 401, `Forbidden` 403, `NotFound` 404, `MethodNotAllowed` 405, `NotAcceptable` 406, `RequestTimeout` 408, `Conflict` 409, `Gone` 410, `InternalServerError` 500, `NotImplemented` 501, `ServiceUnavailable` 503 — all empty-body errors built with `HttpApiSchema.EmptyError` (`HttpApiSchema.ts:645`), which are also `Effect`s so you can `yield*` / `Effect.fail(new HttpApiError.NotFound())`. Every `HttpApi.make` automatically carries `HttpApiDecodeError` (400, request-validation failure) (`HttpApi.ts:261-268`, `HttpApiError.ts:34`).
- **Group option**: `HttpApiGroup.make("name", { topLevel: true })` lifts endpoints out of the group namespace in the derived client/OpenAPI (`HttpApiGroup.ts:420`).

**Contract-in-its-own-package**: yes, this works and is the intended design. The contract file above imports only `@effect/platform` and `effect`. `HttpApi`/`HttpApiGroup`/`HttpApiEndpoint` values are pure immutable descriptions (schemas + metadata); nothing server-side is instantiated. Package deps: `@effect/platform` (peer-deps only `effect`; its own runtime deps are `find-my-way-ts`, `msgpackr`, `multipasta` — `packages/platform/package.json:49-56`) + `effect`. The same contract package feeds `HttpApiClient.make(MyApi, { baseUrl })` for a fully typed client, and `OpenApi.fromApi(MyApi)` for spec generation.

## Server implementation (@effect/platform-bun)

```ts
// main.ts
import { HttpApiBuilder, HttpApiSwagger, HttpMiddleware, HttpServer } from "@effect/platform"
import { BunHttpServer, BunRuntime } from "@effect/platform-bun"
import { Config, Effect, Layer } from "effect"
import { MyApi, User, UserNotFound } from "@acme/api-contract"

// 1. Implement one Layer per group. Handler arg is fully typed:
//    { path, urlParams, payload, headers, request } — only the keys whose schemas were set.
const UsersLive = HttpApiBuilder.group(MyApi, "users", (handlers) =>
  handlers
    .handle("findById", ({ path }) =>
      path.id === 1
        ? Effect.succeed(new User({ id: 1, name: "John" }))
        : Effect.fail(new UserNotFound({ id: path.id })))       // must be a declared error
    .handle("list", ({ urlParams }) => Effect.succeed([]))      // urlParams.page: number
    .handle("create", ({ payload }) => Effect.succeed(new User({ id: 2, name: payload.name })))
    .handle("remove", () => Effect.void))                       // 204

// 2. Assemble the Api layer from all group layers
const ApiLive = HttpApiBuilder.api(MyApi).pipe(Layer.provide(UsersLive))

// 3. Serve
const ServerLive = HttpApiBuilder.serve(HttpMiddleware.logger).pipe(
  Layer.provide(HttpApiSwagger.layer({ path: "/docs" })),          // optional Swagger UI
  Layer.provide(HttpApiBuilder.middlewareOpenApi()),               // serves /openapi.json
  Layer.provide(HttpApiBuilder.middlewareCors({
    allowedOrigins: ["http://localhost:5173"],
    allowedMethods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    credentials: true
  })),
  Layer.provide(ApiLive),
  HttpServer.withLogAddress,                                       // logs "Listening on ..."
  Layer.provide(BunHttpServer.layerConfig({
    port: Config.integer("PORT").pipe(Config.withDefault(3000))    // Config from env
  }))
)

BunRuntime.runMain(Layer.launch(ServerLive))
```

Details, cited:

- `HttpApiBuilder.group(api, groupName, build)` returns `Layer<HttpApiGroup.ApiGroup<ApiId, Name>>`; the `build` callback may also return an `Effect` of handlers, so you can `yield*` services during construction (`packages/platform/src/HttpApiBuilder.ts:458-507`). `handle` accepts `{ uninterruptible?: boolean }` as a third arg. `handleRaw` skips payload decoding and lets you return an `HttpServerResponse` yourself (`HttpApiBuilder.ts:261`); any handler may also return a raw `HttpServerResponse` instead of the success type (`HttpApiBuilder.ts:699`). The compiler rejects the layer until every endpoint in the group is handled (`Handlers.ValidateReturn`, `HttpApiBuilder.ts:332`).
- `HttpApiBuilder.api(api)` creates the `HttpApi.Api` layer requiring every group layer (`HttpApiBuilder.ts:59`). `HttpApiBuilder.serve(middleware?)` builds the router into an `HttpApp` and serves it on the provided `HttpServer` (`HttpApiBuilder.ts:81-95`); the optional argument is a plain `HttpApp` middleware — `HttpMiddleware.logger` (`packages/platform/src/HttpMiddleware.ts:43`) is the standard request logger.
- **Bun server layers** (`packages/platform-bun/src/BunHttpServer.ts`): `layer({ port })` (:51) provides `HttpServer | HttpPlatform | Etag.Generator | BunContext`; `layerConfig(Config.Config.Wrap<ServeOptions>)` (:75, impl `src/internal/httpServer.ts:197`) is the same but every field may be a `Config` — the idiomatic way to read the port from env. `layerTest` (:62) starts on a random port and provides an `HttpClient` pointed at it (ideal for integration tests). Options pass through to `Bun.serve` (TLS/unix variants supported).
- `BunRuntime.runMain` is a re-export of `NodeRuntime.runMain` (`packages/platform-bun/src/BunRuntime.ts:11`) — handles interrupt-on-SIGINT + exit codes; combine with `Layer.launch`.
- **CORS**: `HttpApiBuilder.middlewareCors({ allowedOrigins, allowedMethods, allowedHeaders, exposedHeaders, maxAge, credentials })` — a `Layer<never>` provided to `serve` (`HttpApiBuilder.ts:966-975`, wraps `HttpMiddleware.cors`, `HttpMiddleware.ts:173`). Generic app-level middleware layers via `HttpApiBuilder.middleware(fn)` (`HttpApiBuilder.ts:910`).
- **HttpApiMiddleware** (contract-level, cross-cutting): declare a tag class `class Authentication extends HttpApiMiddleware.Tag<Authentication>()("Authentication", { failure: Unauthorized, provides: CurrentUser, optional?: boolean, security: { bearer: HttpApiSecurity.bearer } }) {}` (`packages/platform/src/HttpApiMiddleware.ts:267`; security constructors `HttpApiSecurity.bearer/apiKey/basic`, `HttpApiSecurity.ts:102-136`). Attach with `.middleware(Authentication)` at endpoint, group, or api level — its `failure` schema joins the error union, and `provides` becomes available in handler context. Implement as a plain `Layer.succeed(Authentication, Authentication.of({ bearer: (token) => Effect.succeed(user) }))` and `Layer.provide` it to the group layer (full worked example: `packages/platform-node/examples/api.ts:34-40,127-138`).
- **Config**: `BunHttpServer.layerConfig` (above) covers port/hostname; any other env config is ordinary `Config.string("...")` read inside your own layers — nothing HttpApi-specific.
- Alternatives worth knowing: `HttpApiBuilder.toWebHandler(layer)` produces a `(Request) => Promise<Response>` fetch handler if you want to own `Bun.serve` yourself (`HttpApiBuilder.ts:182`, pair with `BunHttpServer.layerContext` :92); the newer `HttpLayerRouter.addHttpApi(api, { openapiPath })` (`packages/platform/src/HttpLayerRouter.ts`) mounts an HttpApi alongside plain routes when mixing styles — `HttpApiScalar`/`HttpApiSwagger` ship `layerHttpLayerRouter` variants for it.

## Client derivation (HttpApiClient)

Verified against the local clone at `~/.effect` (exact target versions: `effect@3.21.4`, `@effect/platform@0.96.2`). Citations are relative to `~/.effect/packages/platform` unless noted.

### 1. `HttpApiClient.make`

```ts
import { HttpApiClient, FetchHttpClient } from "@effect/platform"

const program = Effect.gen(function* () {
  const client = yield* HttpApiClient.make(Api, {
    baseUrl: "http://localhost:3000",          // URL | string, prepended via HttpClientRequest.prependUrl
    transformClient: HttpClient.retryTransient({ times: 3 }) // optional
  })
  const user = yield* client.users.getUser({ path: { id: 1 } })
})
```

- Signature (`src/HttpApiClient.ts:250-263`): `make(api, { transformClient?, transformResponse?, baseUrl? })` returns `Effect<Client<Groups, ApiError, never>, never, HttpApiMiddleware.Without<...> | HttpClient.HttpClient>`. It never fails; it reads `HttpClient.HttpClient` from context and reflects over the API definition to build a plain record of functions (`src/HttpApiClient.ts:288-298`).
- Shape: `client.<groupIdentifier>.<endpointName>(request)`. Groups created with `HttpApiGroup.make("root", { topLevel: true })` flatten their endpoints onto the client root: `client.healthz()` (`src/HttpApiClient.ts:31-43`, README "Top Level Groups").
- The request object is structurally typed per endpoint (`src/HttpApiEndpoint.ts:442-454`): only keys the endpoint declares exist — `{ path?, urlParams?, payload?, headers?, withResponse? }`. An endpoint with no inputs takes `void`: `client.group.error()` (test `platform-node/test/HttpApi.test.ts:347`). Multipart payloads are typed as `FormData` (`src/HttpApiEndpoint.ts:448-449`); passing a `FormData` instance always short-circuits to a form-data body (`src/HttpApiClient.ts:208-209`).
- Path params are interpolated client-side from `request.path` into the `:param` template (`compilePath`, `src/HttpApiClient.ts:397-414`); payloads on body-less methods (GET) are encoded as URL params instead (`src/HttpApiClient.ts:210-217`).
- `HttpApiClient.makeWith(api, { httpClient, baseUrl?, transformResponse? })` is the lower-level variant taking an explicit `HttpClient.With<E, R>` instead of reading from context — the extra `E`/`R` of that client flow into every endpoint's signature (`src/HttpApiClient.ts:274-287`; test at :180-201 threads a custom `CurrentUser` requirement through to call sites).
- The context present when you run `make` is captured and merged into every later call (`src/HttpApiClient.ts:236`), so the client object is self-contained after construction.

### 2. Error channel

Each endpoint method returns (`Client.Method`, `src/HttpApiClient.ts:83-89`):

```ts
Effect<Success, DeclaredEndpointErrors | GroupError | ApiError | HttpClientError.HttpClientError | ParseResult.ParseError, R>
```

- **Declared errors** (`.addError` on endpoint/group/api) are *decoded from the response body by status code and failed with as real instances* — e.g. `Effect.flip` yields `new GroupError()` / `RateLimitError` equal by value (tests :125-132, :314-350). Empty-body errors via `HttpApiSchema.asEmpty` decode too.
- **`HttpApiDecodeError`** (`src/HttpApiError.ts:34`, tag `"HttpApiDecodeError"`, status 400, `{ issues, message }`) is always in the union because `HttpApi.make` seeds `ApiError = HttpApiDecodeError` (`src/HttpApi.ts:261`). It's the server's request-validation failure, decoded client-side like any declared error (test :157-165).
- **Infrastructure errors** (exhaustive):
  - `HttpClientError.RequestError` — tag `"RequestError"`, `reason: "Transport" | "Encode" | "InvalidUrl"` (`src/HttpClientError.ts:38-40`): network failure, bad URL.
  - `HttpClientError.ResponseError` — tag `"ResponseError"`, `reason: "StatusCode" | "Decode" | "EmptyBody"` (`src/HttpClientError.ts:59-62`): a status not declared in the API produces `reason: "Decode"` (`statusOrElse`, `src/HttpApiClient.ts:503-510`); a declared error status whose schema has no AST produces `reason: "StatusCode"` (`src/HttpApiClient.ts:166-173`).
  - `ParseResult.ParseError` — tag `"ParseError"`: failure encoding your request (path/payload/headers/urlParams schemas) or decoding a response body against the success/error schema.
- All are tagged, so client-side handling is plain `catchTag`/`catchTags`:

```ts
client.users.create({ payload }).pipe(
  Effect.catchTags({
    UserError: (e) => ...,            // declared, decoded instance
    HttpApiDecodeError: (e) => Effect.log(e.issues),
    RequestError: (e) => ...,         // network
    ResponseError: (e) => ...,        // undeclared status / bad body
    ParseError: (e) => ...
  })
)
```

### 3. HttpClient layer (Bun) and `transformClient`

- The client needs `HttpClient.HttpClient` in context. **There is no `BunHttpClient`** — `@effect/platform-bun` exports no HTTP client module (checked `platform-bun/src/`), and `BunContext.layer` does not include one. Use **`FetchHttpClient.layer`** from `@effect/platform` (`src/FetchHttpClient.ts:25`, built on global `fetch` — Bun and browsers both have it). On Node you could use `NodeHttpClient.layer` instead; for a Bun API + browser React app, `FetchHttpClient.layer` on both sides is the answer.

```ts
import { FetchHttpClient } from "@effect/platform"
program.pipe(Effect.provide(FetchHttpClient.layer))
```

- Fetch behavior is tunable via `FetchHttpClient.Fetch` (swap the fetch impl) and `FetchHttpClient.RequestInit` tags (`src/FetchHttpClient.ts:13-19`) — e.g. `Layer.succeed(FetchHttpClient.RequestInit, { credentials: "include" })` for cookie auth.
- `transformClient` is `(client: HttpClient) => HttpClient`, applied once at derivation (`src/HttpApiClient.ts:267`). Compose stock combinators from `@effect/platform/HttpClient`:

```ts
transformClient: (c) =>
  c.pipe(
    HttpClient.mapRequest(HttpClientRequest.setHeader("authorization", `Bearer ${token}`)),
    HttpClient.retryTransient({ times: 3, schedule: Schedule.exponential(100) }) // src/HttpClient.ts:525
  )
```

  For dynamic per-call auth, prefer an effectful `HttpClient.mapRequestEffect` / `tapRequest` reading a service, passed via `makeWith` (pattern in test :177-201, cookie-jar auth via `HttpClient.withCookiesRef` at :204-214).
- There is also `transformResponse?: (effect) => effect`, wrapping the per-call decode effect (`src/HttpApiClient.ts:232-234`) — a hook for logging/metrics around every response.

### 4. Partial clients: `HttpApiClient.group` / `HttpApiClient.endpoint`

Both exist and both require an explicit `httpClient` (they do not read it from context):

```ts
const usersClient = yield* HttpApiClient.group(Api, {
  group: "users", httpClient: yield* HttpClient.HttpClient, baseUrl
})                                          // usersClient.create({...}) — src/HttpApiClient.ts:305-341

const createUser = yield* HttpApiClient.endpoint(Api, {
  group: "users", endpoint: "create", httpClient, baseUrl
})                                          // createUser({...}) — a bare function; src/HttpApiClient.ts:347-391
```

Group/endpoint names are typed literals with autocomplete. Only the selected group's/endpoint's middleware context is required at construction, so partial clients are useful when one group carries auth middleware you don't want to satisfy globally. Canonical usage: test :34-68.

### 5. Response mapping

- The success schema is decoded per status via `HttpClientResponse.matchStatus` (`src/HttpApiClient.ts:161-176`); body is read as `ArrayBuffer` then decoded according to the endpoint's `HttpApiSchema` encoding (Json | Text | UrlParams | Uint8Array, `src/HttpApiClient.ts:479-501`). Class schemas yield real instances (`new User({...})` deep-equals, test :49-52).
- Endpoints with no `.addSuccess` (or `HttpApiSchema.NoContent`) map 204 to `Effect<void>` (`responseAsVoid`, `src/HttpApiClient.ts:175,521`).
- `withResponse: true` on any call returns `[Success, HttpClientResponse]` instead of `Success` (`src/HttpApiClient.ts:86,235`; test :250-256) — access to status/headers without losing typing.

### 6. Using the derived client outside Effect (React edge)

Derive **once** — construction is pure wiring (never fails, no I/O) — and export plain promise functions:

```ts
// api-client.ts
const runtime = ManagedRuntime.make(FetchHttpClient.layer)
export const client = await runtime.runPromise(
  HttpApiClient.make(Api, { baseUrl: import.meta.env.VITE_API_URL })
)
// per call, at the React boundary:
const user = await runtime.runPromise(client.users.getUser({ path: { id } }))
```

Because the client captures its context at creation (`src/HttpApiClient.ts:236`), the endpoint effects have `R = never` and can be run by any runtime (`Effect.runPromise` works too). `Effect.runSync` also works for construction since `FetchHttpClient.layer` is synchronous (`src/internal/fetchHttpClient.ts:57`), but `ManagedRuntime` is the safer general pattern. Keep one shared client/runtime module; per-call derivation only re-runs schema compilation for nothing. (tanstack-query integration covered elsewhere.)

Note: the docs URL `effect.website/docs/platform/http-api/` 404s; the equivalent prose lives in `~/.effect/packages/platform/README.md` ("Deriving a Client", lines 151-205 and 2151-2265), which matches the behavior above.

## OpenAPI generation, Scalar docs, spec emit

All modules ship in `@effect/platform`: `OpenApi`, `OpenApiJsonSchema`, `HttpApiScalar`, `HttpApiSwagger`, plus `HttpApiBuilder.middlewareOpenApi`.

### 1. `OpenApi.fromApi`

```ts
import { OpenApi } from "@effect/platform"
const spec = OpenApi.fromApi(api, { additionalPropertiesStrategy: "allow" }) // OpenApi.OpenAPISpec
```

- Signature: `fromApi(api: HttpApi<Id, Groups, E, R>, options?: { additionalPropertiesStrategy?: "allow" | "strict" }): OpenAPISpec` — **pure, synchronous, not an Effect** (`~/.effect/packages/platform/src/OpenApi.ts:229`).
- Emits **OpenAPI 3.1.0** (`openapi: "3.1.0"` hardcoded, OpenApi.ts:241; `OpenAPISpec` interface at OpenApi.ts:496). JSON Schema conversion targets `"openApi3.1"` with `definitionPath: "#/components/schemas/"` (`OpenApiJsonSchema.ts:293-299`, delegating to `effect/JSONSchema`).
- Defaults: `info.title = "Api"`, `info.version = "0.0.1"` unless annotated (OpenApi.ts:243-244). `additionalPropertiesStrategy` defaults to `"strict"` (`additionalProperties: false` everywhere).
- Results are **cached per api instance in a WeakMap** (OpenApi.ts:160, 235-238, 447). Gotcha: the cache is not keyed by options — a second `fromApi(api, otherOptions)` call in the same process returns the first spec.

**Annotations** — Context tags applied with `.annotate(Tag, value)` on api/group/endpoint, or in bulk via `.annotateContext(OpenApi.annotations({...}))` (OpenApi.ts:128-158). Tags: `Identifier`, `Title`, `Version`, `Description`, `License`, `Summary`, `Deprecated`, `ExternalDocs`, `Servers`, `Format` (bearer format on security), `Override` (shallow `Object.assign` onto the emitted node), `Transform` (fn over the emitted node), `Exclude` (boolean, drops group/endpoint from spec — OpenApi.ts:299, 322).

- Api level: Title/Version/Description/License/Summary → `info`; `Servers` → `servers`; `Override`/`Transform` apply to the whole spec (OpenApi.ts:440-445). `HttpApi.AdditionalSchemas` (a `HttpApi` tag, not `OpenApi`) injects extra `components.schemas` — only schemas with an `identifier` annotation are included.
- Group level: `Title` overrides the tag name (default = group identifier, OpenApi.ts:303); `Description`/`ExternalDocs` enrich the tag.
- Endpoint level: `Identifier` overrides `operationId` (default `` `${group.identifier}.${endpoint.name}` ``, OpenApi.ts:327-331); `Description`, `Summary`, `Deprecated`, `ExternalDocs`, `Override`, `Transform`, `Exclude`.

```ts
const api = HttpApi.make("mamen")
  .annotateContext(OpenApi.annotations({ title: "Mamen API", version: "1.0.0", description: "..." }))
  .add(group.annotate(OpenApi.Exclude, true)) // hidden group
```

### 2. Serving `/openapi.json` — built-in

`HttpApiBuilder.middlewareOpenApi` is the canonical way; no hand-rolled route needed (`~/.effect/packages/platform/src/HttpApiBuilder.ts:983-1000`). It registers a GET route on the builder's internal `Router`, default path `/openapi.json`; the JSON response is computed once at layer build time.

```ts
import { HttpApiBuilder } from "@effect/platform"
Layer.provide(HttpApiBuilder.middlewareOpenApi({ path: "/api/openapi.json" }))
```

Requires the `HttpApi.Api` service, i.e. it must sit under `HttpApiBuilder.serve` alongside `HttpApiBuilder.api(api)`.

### 3. Scalar docs UI

`HttpApiScalar.layer(options?)` (`~/.effect/packages/platform/src/HttpApiScalar.ts:167-182`): mounts a GET route (default `"/docs"`) returning a self-contained HTML page with the spec inlined as JSON and the Scalar bundle **inlined** (works offline). `layerCdn` variant loads Scalar from jsdelivr instead (accepts `version`). `layerHttpLayerRouter`/`layerHttpLayerRouterCdn` are for the newer `HttpLayerRouter` stack. Options: `path?: \`/${string}\``, `scalar?: ScalarConfig` — theme (`"default" | "moon" | "purple" | "kepler" | ...`), `layout: "modern" | "classic"`, `hideModels`, `darkMode`, `customCss`, etc. (HttpApiScalar.ts:39-102). `HttpApiSwagger.layer({ path? })` is the Swagger-UI equivalent.

Composition with serve (Bun):

```ts
import { HttpApiBuilder, HttpApiScalar, HttpMiddleware, HttpServer } from "@effect/platform"
import { BunHttpServer, BunRuntime } from "@effect/platform-bun"
import { Layer } from "effect"

const ApiLive = HttpApiBuilder.api(api).pipe(Layer.provide(groupsLive))

const ServerLive = HttpApiBuilder.serve(HttpMiddleware.logger).pipe(
  Layer.provide(HttpApiScalar.layer({ path: "/docs" })),
  Layer.provide(HttpApiBuilder.middlewareOpenApi({ path: "/api/openapi.json" })),
  Layer.provide(HttpApiBuilder.middlewareCors()),
  Layer.provide(ApiLive),
  HttpServer.withLogAddress,
  Layer.provide(BunHttpServer.layer({ port: 3000 }))
)
BunRuntime.runMain(Layer.launch(ServerLive))
```

Both doc layers depend only on `HttpApi.Api` + the builder `Router` (provided internally by `serve` via `Router.Live`, HttpApiBuilder.ts:94), so `Layer.provide` order among them doesn't matter as long as `ApiLive` is below.

### 4. Spec-emit script

`fromApi` is pure — no runtime, no layers, no handlers needed; import the contract only:

```ts
// scripts/emit-openapi.ts  (bun run scripts/emit-openapi.ts)
import { OpenApi } from "@effect/platform"
import { api } from "@mamen/contract" // package exporting HttpApi.make(...) only

const spec = OpenApi.fromApi(api)
await Bun.write("openapi.json", JSON.stringify(spec, null, 2) + "\n")
```

Determinism: output is stable across runs for the same source. Top-level key order is fixed by an object literal (`openapi, info, paths, components, security, tags`, OpenApi.ts:240-253); `paths`, `tags`, and `components.schemas` follow declaration/traversal order (order of `.add(...)` calls) — reordering groups/endpoints in code reorders the file, but nothing time-, random-, or environment-dependent exists in the generator. `responses` keys are numeric status codes, so `JSON.stringify` emits them in ascending integer order regardless of insertion. Only user-supplied `Transform` functions could introduce nondeterminism. Safe to commit; git diffs stay minimal.

### 5. Schema annotations that reach the spec

- `Schema.annotations({ description, title, examples, default })` → copied onto the JSON Schema node (parameter `description` is also lifted onto the OpenAPI parameter object, OpenApi.ts:373).
- `Schema.annotations({ identifier: "User" })` → schema is hoisted to `components.schemas.User` and referenced as `$ref: "#/components/schemas/User"`; without an identifier the schema is inlined at each use site.
- `HttpApiSchema.annotations({ status, ...schemaAnnotations })` (`~/.effect/packages/platform/src/HttpApiSchema.ts:153-163`) — same shape as `Schema.Annotations.Schema` plus `status`, which sets the response status key. Defaults: success 200 (204 for `Schema.Void`), error 500 (HttpApiSchema.ts:190, 202). E.g. `.addSuccess(User, { status: 201 })` or `Schema.String.annotations(HttpApiSchema.annotations({ status: 201 }))`; `HttpApiSchema.Empty(status)` for bodiless responses. Response `description` comes from the schema's description annotation, falling back to `"Success"`/`"Error"` (OpenApi.ts:344-360, 420-421).
- Content type comes from `HttpApiSchema` encoding annotations (`HttpApiSchema.withEncoding`, `getEncoding` — HttpApiSchema.ts:137), default `application/json`.

Note: the docs page moved — https://effect.website/docs/platform/http-api/ 404s as of 2026-07; the maintained reference is `~/.effect/packages/platform/README.md` (annotation tables at line ~1726, Swagger composition example at 1706-1721).

## Data layer (@effect/sql-sqlite-bun)

Surveyed from local source at `~/.effect` (commit d24511f, 2026-07-08): `@effect/sql` 0.51.1, `@effect/sql-sqlite-bun` 0.52.0, `effect` 3.21.4. The package has only two modules — `SqliteClient` and `SqliteMigrator` (`packages/sql-sqlite-bun/src/index.ts`). Model/SqlSchema/SqlResolver live in `@effect/sql` (not experimental), though Model is built on `@effect/experimental/VariantSchema`, which is a peer dep.

### 1. Client layer + tagged-template queries

```ts
import { SqliteClient } from "@effect/sql-sqlite-bun"
import { SqlClient } from "@effect/sql"
import { Config, Effect, Layer, String } from "effect"

const SqlLive = SqliteClient.layer({
  filename: "data/app.db",
  // optional camelCase <-> snake_case bridging:
  transformQueryNames: String.camelToSnake,
  transformResultNames: String.snakeToCamel
})
// or from config:
const SqlLiveConfig = SqliteClient.layerConfig({ filename: Config.string("DB_PATH") })
```

- `SqliteClientConfig` (`packages/sql-sqlite-bun/src/SqliteClient.ts:56-67`): `filename`, `readonly?`, `create?` (default true), `readwrite?` (default true), `disableWAL?`, `spanAttributes?`, `transformResultNames?`, `transformQueryNames?`. **WAL is on by default** — `PRAGMA journal_mode = WAL` runs unless `disableWAL: true` (SqliteClient.ts:97-99).
- Both layers provide **two tags**: `SqliteClient.SqliteClient` (adds `.export` — `db.serialize()` to `Uint8Array` — and `.loadExtension`) and the generic `SqlClient.SqlClient` from `@effect/sql/SqlClient` (SqliteClient.ts:222-230). The `Reactivity` requirement is satisfied internally (`Layer.provide(Reactivity.layer)`). Declared layer error is `ConfigError`.
- Query API (from `@effect/sql/Statement`, `packages/sql/src/Statement.ts:268-356`):

```ts
const sql = yield* SqlClient.SqlClient
const rows = yield* sql<{ id: number; name: string }>`select * from accounts where id = ${id}`
sql("accounts")                          // identifier interpolation: `"accounts"`
sql.in([1, 2, 3])                        // (?,?,?)
sql.in("id", ids)                        // `"id" IN (?,?,?)` — empty array compiles to `1=0` (internal/statement.ts:431)
sql.and([sql`archived = 0`, sql.in("id", ids)])  // parenthesized AND chain; empty → `1=1` (internal/statement.ts:471)
sql.or([...])                            // same, OR
sql.csv("order by", ["name", "id"])
sql.insert({ name, currency })           // also accepts arrays; .returning("*")
sql.update(row, ["id"])                  // SET clause omitting listed keys
```

Statement verbs: awaiting the statement executes it; `.values` returns positional arrays; `.unprepared`; `.compile()`. **`sql.updateValues` (multi-row update) is not supported on sqlite** (SqliteClient.ts:43) and **`.stream` dies** — `executeStream` is `Effect.dieMessage("executeStream not implemented")` (SqliteClient.ts:148-150). Note bun's `executeRaw` just returns rows like `execute` (SqliteClient.ts:139-141) — unlike sqlite-node, `.raw` does **not** give `{ changes, lastInsertRowid }`; use `returning *` instead.

### 2. In-memory tests

`filename` is passed verbatim to `new Database(options.filename, ...)` from `bun:sqlite` (SqliteClient.ts:90), so bun's native `":memory:"` works:

```ts
export const SqlTest = SqliteClient.layer({ filename: ":memory:" })
// per-test isolation: build the layer fresh per test (Layer.fresh / it.effect with Effect.provide)
```

Each layer instantiation is a new independent in-memory DB; the connection is closed by the layer scope finalizer (SqliteClient.ts:95).

### 3. SqlSchema (`@effect/sql/SqlSchema`)

Four constructors (`packages/sql/src/SqlSchema.ts`): `findAll` (decode all rows), `findOne` (→ `Option<A>`, decodes row 0 only), `single` (→ `A`, fails `Cause.NoSuchElementException` on empty, SqlSchema.ts:91-96), `void` (encode request, discard result). Each takes `{ Request: Schema, Result: Schema, execute: (encodedRequest) => Effect<rows> }` and returns `request => Effect`. Request is **encoded**, rows are **decoded**; decode/encode failures surface as `ParseError` in the error channel, unioned with your execute error: `Effect<A, E | ParseError, R>`.

```ts
import { SqlSchema } from "@effect/sql"
const findByCategory = SqlSchema.findAll({
  Request: CategoryId,
  Result: Transaction,
  execute: (id) => sql`select * from transactions where category_id = ${id}`
})
```

### 4. Model (`@effect/sql/Model`) — the canonical repository pattern

Yes — `Model.Class` + `Model.makeRepository` is the canonical @effect/sql repository pattern (it's what the official README/examples and `sql-*/test/Model.test.ts` use; nothing newer has replaced it). `Model.Class` is `VariantSchema.make` with variants `["select","insert","update","json","jsonCreate","jsonUpdate"]`, default `select` (`packages/sql/src/Model.ts:29-32`). Key fields:

- `Model.Generated(S)` — in select/update/json, **absent from insert** (Model.ts:191-198). `Model.GeneratedByApp(S)` — required by DB, absent from json variants.
- `Model.Sensitive(S)` — excluded from all json variants. `Model.FieldOption(S)` — nullable in DB variants, optional key in json variants.
- `Model.DateTimeInsert` / `Model.DateTimeUpdate` — `DateTime.Utc` stored as ISO-8601 TEXT; auto-filled with `DateTime.now` at encode time via `VariantSchema.Overrideable` (Model.ts:377-383), so you omit them in `.insert.make(...)`. `...FromNumber` variants store epoch millis (better for range queries/sorting in sqlite); `...FromDate` variants are for drivers with native Date (not bun:sqlite — see §8).
- `Model.BooleanFromNumber` — boolean ⇔ 0/1 (Model.ts:669-676). `Model.JsonFromString(S)` — JSON stored as TEXT. `Model.UuidV4Insert(brandedUint8Array)` — binary UUID generated on insert.

`Model.makeRepository(Model, { tableName, spanPrefix, idColumn })` (Model.ts:684) returns `{ insert, insertVoid, update, updateVoid, findById, delete }`. On sqlite it uses `insert ... returning *` / `update ... returning *` (Model.ts:730, 772-774) so `insert`/`update` return the decoded row. **Gotcha: every repo method is `Effect.orDie`'d** (Model.ts:737 etc.) — `SqlError`/`ParseError` become defects, error channel is `never`. For typed errors write custom `SqlSchema` queries. `Model.makeDataLoaders` (Model.ts:846) adds batched/windowed variants via `SqlResolver` (`ordered`/`grouped`/`findById`/`void` in `packages/sql/src/SqlResolver.ts`) — only worth it for request-batching workloads.

```ts
// Account.ts
import { Model } from "@effect/sql"
import { Schema } from "effect"
export const AccountId = Schema.Int.pipe(Schema.brand("AccountId"))
export class Account extends Model.Class<Account>("Account")({
  id: Model.Generated(AccountId),
  name: Schema.NonEmptyTrimmedString,
  currency: Schema.String,
  archived: Model.BooleanFromNumber,
  createdAt: Model.DateTimeInsert,
  updatedAt: Model.DateTimeUpdate
}) {}

// AccountRepo.ts
import { Model, SqlClient, SqlSchema } from "@effect/sql"
import { Effect, Schema } from "effect"
export class AccountRepo extends Effect.Service<AccountRepo>()("AccountRepo", {
  effect: Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    const repo = yield* Model.makeRepository(Account, {
      tableName: "accounts", spanPrefix: "AccountRepo", idColumn: "id"
    })
    const findActive = SqlSchema.findAll({
      Request: Schema.Void,
      Result: Account,
      execute: () => sql`select * from accounts where archived = 0 order by name`
    })
    return { ...repo, findActive: () => findActive(void 0) } as const
  })
}) {}
// usage: yield* repo.insert(Account.insert.make({ name: "Checking", currency: "EUR", archived: false }))
```

### 5. Migrations

`SqliteMigrator` (from `@effect/sql-sqlite-bun`) re-exports everything from `@effect/sql/Migrator` and `@effect/sql/Migrator/FileSystem` (`packages/sql-sqlite-bun/src/SqliteMigrator.ts:19-24`), adding a sqlite `dumpSchema`. `SqliteMigrator.layer(options)` is `Layer.effectDiscard(run(options))` (SqliteMigrator.ts:84-90) — **migrations run when the layer is built, i.e. at startup**.

- Options (`packages/sql/src/Migrator.ts:17-21`): `{ loader, schemaDirectory?, table? = "effect_sql_migrations" }`.
- Loaders: `fromFileSystem(dir)` — reads files matching `/^(?:.*\/)?(\d+)_([^.]+)\.(js|ts)$/` and dynamic-`import()`s them (`packages/sql/src/Migrator/FileSystem.ts:20-37`); works natively under Bun since Bun imports `.ts` directly. `fromGlob(import.meta.glob("./migrations/*"))` for Vite-bundled code (Migrator.ts:298). `fromRecord({ "0001_create_accounts": effect })` — no filesystem at all, best for compiled/single-binary Bun deploys (Migrator.ts:338).
- File convention: `migrations/0001_create_accounts.ts`, default export an `Effect` requiring `SqlClient`:

```ts
import { SqlClient } from "@effect/sql"
import { Effect } from "effect"
export default Effect.flatMap(SqlClient.SqlClient, (sql) =>
  sql`create table accounts (
    id integer primary key autoincrement,
    name text not null,
    currency text not null,
    archived integer not null default 0,
    created_at text not null,
    updated_at text not null
  )`)
```

- Semantics: ids must be unique; already-applied ids (≤ latest in table) are skipped; the whole run executes inside `sql.withTransaction` (Migrator.ts:275); a concurrent runner surfaces as reason `"locked"` and is ignored. Failure type: `MigrationError` (`reason: "bad-state" | "import-error" | "failed" | "duplicates" | "locked"`, Migrator.ts:57-67).
- Wiring under Bun — the layer needs `FileSystem | Path | CommandExecutor`, provided by `BunContext.layer`:

```ts
import { SqliteClient, SqliteMigrator } from "@effect/sql-sqlite-bun"
import { BunContext } from "@effect/platform-bun"
import { Layer } from "effect"
const MigratorLive = SqliteMigrator.layer({
  loader: SqliteMigrator.fromFileSystem(new URL("migrations", import.meta.url).pathname)
}).pipe(Layer.provide([SqlLive, BunContext.layer]))
export const DatabaseLive = Layer.mergeAll(SqlLive, MigratorLive)
```

- `schemaDirectory` triggers a `_schema.sql` dump by shelling out to the **`sqlite3` CLI binary** (SqliteMigrator.ts:37-58) — omit it if `sqlite3` isn't on PATH (failure is only logged, Migrator.ts:282-287).

### 6. Transactions

`sql.withTransaction(effect)` wraps the effect in `BEGIN`/`COMMIT`, rolls back on failure/defect/interrupt, and adds `SqlError` to the error channel (`packages/sql/src/SqlClient.ts:52-54`). **Nesting = savepoints**: a `withTransaction` inside an active transaction issues `SAVEPOINT effect_sql_<depth>` / `ROLLBACK TO SAVEPOINT` instead of BEGIN/COMMIT (`packages/sql/src/internal/client.ts:39-40,63,144`), tracked via the `TransactionConnection` context tag, so inner failures roll back only the inner scope. The bun client has a **single connection guarded by a one-permit semaphore**; a transaction holds the permit for its whole duration (SqliteClient.ts:163-178), so queries from other fibers block until it commits — no interleaving, but also: don't await another fiber's plain query from inside a transaction (deadlock). Fibers forked inside the transaction inherit `TransactionConnection` and participate in it.

### 7. Errors

`SqlError` (`packages/sql/src/SqlError.ts:19-22`): `class SqlError extends TypeIdError(SqlErrorTypeId, "SqlError")<{ cause?: unknown; message?: string }>` — a tagged error (`_tag: "SqlError"`) wrapping the driver exception in `cause`. It flows through the typed error channel of every statement (`Statement<A> extends Effect<ReadonlyArray<A>, SqlError>`, Statement.ts:47) — handle with `Effect.catchTag("SqlError", ...)`. Repository-layer error unions in practice: `SqlError | ParseError` (SqlSchema), `+ NoSuchElementException` (single), `ResultLengthMismatch` (SqlResolver.ordered), except `makeRepository` which dies (§4).

### 8. bun:sqlite gotchas

- **Dates**: bun:sqlite cannot bind JS `Date` objects (throws "expected string, TypedArray, boolean, number, bigint or null"). Use `Model.DateTimeInsert`/`DateTimeUpdate` (ISO TEXT) or `...FromNumber` (epoch millis) — **not** the `...FromDate` variants.
- **Booleans**: bound as 1/0, read back as numbers — decode with `Model.BooleanFromNumber`.
- **Integers/bigint**: read back as `number` by default; enable per-fiber `safeIntegers` (int64 → `bigint`) via `Effect.provideService(SqlClient.SafeIntegers, true)` — a `Context.Reference` defaulting to false (SqlClient.ts:146-148) read per statement (SqliteClient.ts:106-110; the `@ts-ignore` there is a bun-types gap fixed in bun PR 26627). Money amounts stored as integer cents are safe as plain numbers.
- **Prepared statements**: every execution goes through `db.query(sql)` (SqliteClient.ts:108), bun's cached-prepared-statement API — statements are reused per SQL string; `executeUnprepared` is an alias for `execute` (SqliteClient.ts:145-147), no real unprepared path.
- **Concurrency**: one connection, semaphore-serialized (§6); WAL (default on) only matters for other *processes* reading the file. Blobs map to `Uint8Array`. No `Statement.stream` support (§1).

## Testing (@effect/vitest)

Verified against the local clone `~/.effect` (main @ `d24511fee`, 2026-07-08) — @effect/vitest 0.29.0 source, npm registry metadata, and GitHub issues.

### 1. `it.effect` / `it.scoped` / `it.live` / `it.scopedLive`

All exported from `@effect/vitest` (which also re-exports all of vitest — `~/.effect/packages/vitest/src/index.ts:17`). Defined at `index.ts:186-201`, wired in `internal.ts:295-304`:

| Variant | Provides | Clock |
|---|---|---|
| `it.effect` | `TestServices` (TestContext) | **TestClock, frozen at epoch 0** |
| `it.scoped` | `TestServices + Scope` | TestClock |
| `it.live` | nothing (identity) | real clock |
| `it.scopedLive` | `Scope` | real clock |

`it.effect` wraps the test in `Effect.provide(TestEnv)` where `TestEnv = TestContext.pipe(Layer.provide(Logger.remove(Logger.defaultLogger)))` (`internal.ts:62-64`) — so logs are silenced and `Clock`/`DateTime.now` return epoch 0. Proof: `~/.effect/packages/platform-node/test/HttpApi.test.ts:29-33` expects `createdAt: DateTime.unsafeMake(0)` from a handler that calls `DateTime.now`, under `it.effect`.

**TestClock gotcha**: under `it.effect`, `Effect.sleep`, `Effect.timeout`, `Schedule`, TTL caches etc. never advance on their own — the test hangs until vitest's timeout. Either advance manually with `yield* TestClock.adjust("30 seconds")` (import `effect/TestClock`), or use `it.live`/`it.scopedLive` for anything that needs real wall-clock time (the Effect repo uses `it.live` for multipart-upload tests, `HttpApi.test.ts:71-93`). The Effect monorepo also disables vitest fake timers to avoid interference: `fakeTimers: { toFake: undefined }` (`~/.effect/vitest.shared.ts`).

```ts
import { assert, describe, expect, it } from "@effect/vitest"
import { Effect, TestClock } from "effect"

it.effect("cache expires", () => Effect.gen(function* () {
  yield* TestClock.adjust("5 minutes")   // instead of really waiting
  // ...
}))
it.scoped("uses scoped resources", () => Effect.gen(function* () {
  const conn = yield* Effect.acquireRelease(open, close)  // Scope provided
}))
```

Extras: `it.effect.skip/.only/.fails/.each(cases)`, `it.effect.prop` (fast-check via Schema or Arbitrary), `it.flakyTest(effect, "30 seconds")` (retries up to 10x, `internal.ts:278-292`).

### 2. `it.layer` — sharing an expensive layer

`layer(L, options?)(name, (it) => ...)` (`index.ts:245-255`, impl `internal.ts:189-275`): builds the layer **once per `layer()` call** in `beforeAll`, closes its scope in `afterAll`, and hands you a scoped `it` whose `it.effect`/`it.scoped` auto-provide the layer's context. TestServices are merged in unless `excludeTestServices: true`. Nested `it.layer(Child)` shares the parent's `Layer.MemoMap` (`internal.ts:245-249`), so common dependencies are memoized, not rebuilt. You can pass your own `memoMap` to share memoization across several `layer()` blocks in a file.

```ts
import { it } from "@effect/vitest"
import { Layer } from "effect"

it.layer(ServerLive)("api", (it) => {          // built once for the block
  it.effect("GET /users", () => Effect.gen(function* () { /* uses ServerLive */ }))
  it.layer(SeedData)("with seed", (it) => {    // nested, memoized against parent
    it.effect("...", () => ...)
  })
})
```

**Fresh layer per test** (full isolation, e.g. one in-memory DB per test): don't use `it.layer`; provide inside each test — `Effect.provide(HttpLive)` per test is exactly what the canonical HttpApi suite does (`HttpApi.test.ts:69`, `:113`, etc.). `Layer.fresh(L)` also defeats memoization where needed.

### 3. Canonical integration pattern: real server + derived HttpApiClient

From `~/.effect/packages/platform-node/test/HttpApi.test.ts`. The magic piece is **`NodeHttpServer.layerTest`** (`~/.effect/packages/platform-node/src/NodeHttpServer.ts:111-118`): it starts a real `node:http` server on **port 0** (ephemeral; `platform-node/src/internal/httpServer.ts:345-349`) and provides an `HttpClient` whose requests get the live server's `http://127.0.0.1:<port>` prepended (`platform/src/internal/httpServer.ts:178-183` via `HttpServer.layerTestClient`). `HttpApiClient.make(Api)` then consumes that `HttpClient` — zero URL plumbing:

```ts
import { HttpApiBuilder, HttpApiClient, HttpClient } from "@effect/platform"
import { NodeHttpServer } from "@effect/platform-node"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer } from "effect"

const HttpApiLive = Layer.provide(HttpApiBuilder.api(Api), [UsersGroupLive, /* ... */])

const HttpLive = HttpApiBuilder.serve().pipe(
  Layer.provide(HttpApiBuilder.middlewareCors()),
  Layer.provide(HttpApiLive),
  Layer.provideMerge(NodeHttpServer.layerTest)   // real server, port 0, wired HttpClient
)                                                 // HttpApi.test.ts:670-674

it.effect("create user round-trips", () =>
  Effect.gen(function* () {
    const client = yield* HttpApiClient.make(Api)               // derived, typed
    const user = yield* client.users.create({ urlParams: { id: 123 }, payload: { name: "Joe" } })
    assert.deepStrictEqual(user, expected)
    const res = yield* HttpClient.get("/healthz")               // raw client also works
    assert.strictEqual(res.status, 204)
  }).pipe(Effect.provide(HttpLive)))               // fresh server per test
```

For this setup, stack sqlite + migrations under `HttpApiLive` (`Layer.provide(SqlLive)`), and either provide per test (fresh DB per test) or wrap the whole thing in `it.layer(HttpLive)(...)` and reset tables between tests. `HttpApiClient.group`/`.endpoint` derive partial clients (`HttpApi.test.ts:35-43`). A `BunHttpServer.layerTest` also exists (`platform-bun/src/internal/httpServer.ts:189-194`, FetchHttpClient + port 0) if tests ever run under Bun.

### 4. Assertions and failure testing

- Plain `expect`/`assert` (re-exported from vitest) work inside `Effect.gen` — a sync throw fails the fiber and the test. Call `addEqualityTesters()` once in a setup file so `expect(...).toEqual` uses `Equal.equals` (Effect repo does this: `~/.effect/vitest.setup.ts:1-3`).
- **Failures**: `Effect.flip` then assert on the error — `const error = yield* client.groups.findById({ path: { id: 0 } }).pipe(Effect.flip); assert.deepStrictEqual(error, new GroupError())` (`HttpApi.test.ts:125-132`). Or `const exit = yield* Effect.exit(program)` and use the helpers.
- **`@effect/vitest/utils`** (subpath export, `~/.effect/packages/vitest/src/utils.ts`): `assertSuccess(exit, value)` / `assertFailure(exit, Cause.fail(err))` (`utils.ts:244-263`), `assertSome/assertNone` (`:188-203`), `assertRight/assertLeft` (`:214-233`), `assertEquals` (Equal.equals-aware, `:58-63`), `strictEqual`, `deepStrictEqual`, `assertTrue`, `assertInstanceOf`, `throws/throwsAsync`.

### 5. CRITICAL — vitest version compatibility

- Every published 0.x of @effect/vitest peers on vitest 3: `0.29.0` (2026-03-20) declares `"vitest": "^3.2.0"`; `0.24.0+` all `^3.2.0`, earlier `^3.0.0`. **No 0.x supports vitest 4.** The only line with `"vitest": "^3.0.0 || ^4.0.0"` is `4.0.0-beta.*` (dist-tag `beta`, currently `4.0.0-beta.94`, 2026-07-07) — but it peers on `effect ^4.0.0-beta`, unusable with effect 3.21.4.
- This is a **hard runtime break, not just a peer warning**: vitest 4 removed `ctx.onTestFinished` from the test context; every `it.effect`/`it.scoped`/`it.live` test throws `TypeError: ctx?.onTestFinished is not a function` (`internal.ts:32`; Effect-TS/effect#5976, opened 2026-01-13, **still open**). Fix PR Effect-TS/effect#5980 (switch to top-level `V.onTestFinished` + widen peer) is **still unmerged** as of 2026-07-08 — main branch still has the broken call. Effect-TS/effect#5796 (peer-range ask) also open. The Effect monorepo itself tests with vitest **3.2.4** (`~/.effect/package.json` devDeps, `packages/vitest/package.json:44`).
- **Verdict: pin `vitest@3.2.4` (and `@vitest/coverage-v8@3.2.4`) in the packages that use @effect/vitest 0.29.0.** The web package can stay on vitest ^4.0.18 — mixed vitest majors per workspace package is fine under bun workspaces; just don't share a single root vitest config/workspace file across both majors. Re-check #5980 before any vitest-4 migration.

### 6. Bun runtime — how tests must be run

- `bunx vitest` / `bun run test` executes the vitest binary **under Node** anyway (bun respects vitest's `#!/usr/bin/env node` shebang). Only `bunx --bun vitest` forces the Bun runtime.
- Vitest under Bun runtime is unreliable: hangs and IPC/worker failures reported against @effect/vitest specifically (Effect-TS/effect#3406 — "IPC Socket is no longer open", hangs), plus current-gen Bun issues with vitest 4 worker forks (oven-sh/bun#27002, Feb 2026; segfaults with `pool: "threads"`; oven-sh/bun#4145 tracking). Vitest does not officially support Bun as a test runtime.
- `bun:sqlite` resolves **only** in the Bun runtime — under Node-run vitest any import graph reaching `@effect/sql-sqlite-bun` fails to resolve. Telling: the Effect repo's own `sql-sqlite-bun` test is a stub that never imports the client (`~/.effect/packages/sql-sqlite-bun/test/Client.test.ts:1-6` — `it.effect("should work", () => Effect.void)`) and their shared config just excludes `bun:sqlite` from optimizeDeps (`~/.effect/vitest.shared.ts`). Even Effect doesn't run bun:sqlite under vitest.
- **Verdict: run vitest on Node** (plain `vitest run`, drop the `bunx --bun` currently in `packages/server/package.json`). Make app code depend only on the `SqlClient.SqlClient` tag from `@effect/sql`; provide `@effect/sql-sqlite-bun`'s `SqliteClient.layer` in prod (Bun runtime) and `@effect/sql-sqlite-node`'s `SqliteClient.layer({ filename: ":memory:" })` in tests. Both drivers accept `:memory:` (constructors at `sql-sqlite-node/src/SqliteClient.ts:103`, `sql-sqlite-bun/src/SqliteClient.ts:90`), and the node client is a single semaphore-guarded connection (`sql-sqlite-node/src/SqliteClient.ts:216-219`), so one layer = one coherent in-memory DB. Migrations via `@effect/sql/Migrator` run identically against either. Note: `better-sqlite3` has a postinstall (prebuilt binary download); with bun as package manager add it to `trustedDependencies` if install skips it.

### 7. v8 coverage

- `@vitest/coverage-v8` collects via the V8 inspector protocol (`node:inspector`) — **it cannot work under Bun (JavaScriptCore)**; vitest's docs list Bun as unsupported for the v8 provider. One more reason tests must run on Node. (Istanbul provider would work under Bun since it instruments at transform time, but that's moot on Node.)
- On Node + vitest 3.2.4 + `@vitest/coverage-v8@3.2.4`, nothing Effect-specific breaks coverage; `Effect.gen` generator bodies map fine through sourcemaps. Practical settings: `coverage: { provider: "v8", include: ["src/**"], thresholds: { lines: X, ... } }` for the gate, set `coverage.all`/`include` so Layer-only and schema-only modules that no test imports still count against the gate, and exclude generated files. Known non-Effect caveat: v8 coverage + multiple pools/environments can over- or under-report (vitest-dev/vitest#5783); keep the Effect server packages on a single `environment: "node"` project.

Sources: [effect#5796](https://github.com/Effect-TS/effect/issues/5796), [effect#5976](https://github.com/Effect-TS/effect/issues/5976), [PR effect#5980](https://github.com/Effect-TS/effect/pull/5980), [effect#3406](https://github.com/Effect-TS/effect/issues/3406), [bun#27002](https://github.com/oven-sh/bun/issues/27002), [bun#4145](https://github.com/oven-sh/bun/issues/4145), [vitest coverage guide](https://vitest.dev/guide/coverage), [vitest#5783](https://github.com/vitest-dev/vitest/issues/5783), npm registry `@effect/vitest` metadata.

## tanstack-query integration

### 1. Library landscape (2026): no canonical bridge — hand-rolling is still the norm

- **No official `@effect/*` react-query package exists.** Nothing in the Effect org bridges tanstack-query; the Effect team's own answer to React data-fetching is effect-atom (below). **[established — npm/GitHub survey, 2026-07]**
- **`effect-query`** (voidhashcom/effect-query, npm `effect-query`): the closest thing to a community standard. ~10k downloads/month, 221 stars, created Oct 2025, actively maintained. `createEffectQuery(layer)` → `eq.queryOptions`/`eq.mutationOptions` taking Effect-returning `queryFn`s; ships an `error.match({ TagA, TagB, OrElse })` wrapper for typed error handling; README shows first-class HttpApiClient + Effect RPC recipes. **Caveat: v1.0.0 (2026-03) targets `effect ^4.0.0-beta`; the effect-3 line is v0.2.1 (`effect ^3.18.4`, `@tanstack/react-query ^5.90.5`)** — compatible with effect 3.21.4 but now in maintenance mode as upstream moves to Effect 4. Verdict: fine to adopt for an app; for an SDK package that makes react-query a peer dep, hand-rolling avoids pinning consumers to its wrapper error type and its Effect-4 migration timeline. **[established facts; verdict is synthesis]**
- `effect-tanstack-query` (npm, 0.1.0): ~14 downloads/month, no repo — ignore. **[established]**
- **`@effect-atom/atom-react`** (tim-smart/effect-atom, successor of `@effect-rx/rx-react`, 751 stars): the Effect-native alternative that *replaces* react-query entirely (Atom + `Result<A, E>` + `useAtomValue`); worth a look only if you're willing to drop react-query. **[established]**

### 2. Hand-rolled pattern: module-scope ManagedRuntime + `queryOptions` factories

This is the pattern in the wild (bitswired/quick-effect-tanstack-boilerplate, osdrive, lucas-barake's "Effect + TanStack Query + React" video, effect-query's own internals): build the `HttpApiClient` inside a layer, hold it in one `ManagedRuntime`, expose a `runPromise`-style runner, wrap in v5 `queryOptions`. **[established pattern; exact code below is synthesis assembled from those sources]**

```ts
// runtime.ts — SDK-internal
import { FetchHttpClient, HttpApiClient } from "@effect/platform"
import { Cause, Effect, Exit, Layer, ManagedRuntime } from "effect"
import { MyApi } from "@mamen/contract"

class Api extends Effect.Service<Api>()("sdk/Api", {
  effect: HttpApiClient.make(MyApi, { baseUrl: "/api" }), // Effect<Client, never, HttpClient>
  dependencies: [FetchHttpClient.layer],
}) {}

const runtime = ManagedRuntime.make(Api.Default) // memoizes the layer; built lazily on first run

export const runQuery = <A, E>(effect: Effect.Effect<A, E, Api>, signal?: AbortSignal): Promise<A> =>
  runtime.runPromiseExit(effect, { signal }).then(
    Exit.match({
      onSuccess: (a) => a,
      onFailure: (cause) => { throw Cause.squash(cause) }, // see §3
    }),
  )
```

```ts
// accounts.queries.ts — SDK export surface
import { queryOptions } from "@tanstack/react-query"

export const accountsKeys = {
  all: ["accounts"] as const,
  lists: () => [...accountsKeys.all, "list"] as const,
  list: (filters: AccountFilters) => [...accountsKeys.lists(), filters] as const,
  detail: (id: string) => [...accountsKeys.all, "detail", id] as const,
}

export const accountsQueries = {
  list: (filters: AccountFilters) =>
    queryOptions({
      queryKey: accountsKeys.list(filters),
      queryFn: ({ signal }) =>
        runQuery(Effect.flatMap(Api, (api) => api.accounts.list({ urlParams: filters })), signal),
    }),
  detail: (id: string) =>
    queryOptions({
      queryKey: accountsKeys.detail(id),
      queryFn: ({ signal }) =>
        runQuery(Effect.flatMap(Api, (api) => api.accounts.get({ path: { id } })), signal),
    }),
}
// consumer: useQuery(accountsQueries.list(filters)); useSuspenseQuery(accountsQueries.detail(id))
```

Notes: `HttpApiClient.make` returns `Effect<Client, never, HttpClient>` (verified in `~/.effect/packages/platform/src/HttpApiClient.ts:250`), so wrapping it in an `Effect.Service` whose layer provides `FetchHttpClient.layer` is the standard move — the client is constructed once when the runtime first builds the layer. Passing react-query's `signal` into `runPromiseExit(effect, { signal })` gives you query cancellation → fiber interruption for free. **[signal option is established Effect API; the wiring is common but I'd call it "good practice" rather than universal]**

### 3. Error handling: never let FiberFailure leak

`Effect.runPromise` rejects with a `FiberFailure` — an `Error` wrapper whose cause sits behind the `Runtime.FiberFailureCauseId` symbol — so react-query's `error` would be a useless wrapper with a mangled stack. **[established; `Runtime.ts:229-274` in effect 3.x]** The canonical unwrap is `runPromiseExit` + `Cause.squash`:

- `Cause.squash` returns the original typed error `E` for `Fail` causes (your `Data.TaggedError`s and the HttpApi error union: `HttpApiDecodeError | HttpClientError | ParseError | <your schema errors>`), and the defect value for `Die` causes. **[established; this exact pattern appears in effect-query's source, typekaizen.com/posts/sentry-effect, and Effect Discord answers]**
- `Data.TaggedError` extends `Error`, so throwing it satisfies react-query's default `Error` constraint; `error._tag` narrowing works in components. To get a *typed* `error` from `useQuery` you still need either explicit generics or v5 module augmentation (`interface Register { defaultError: ... }`) — react-query cannot infer the error type from `queryFn`, period. This is the one place the Effect error union genuinely degrades at the boundary. **[established tanstack limitation]**
- Alternative some codebases use: `Effect.catchAll` into a single normalized SDK error class before running, so the thrown type is a closed union you can register globally. **[synthesis, but low-risk]**

### 4. queryKey strategy

Nothing Effect-specific exists; the convention is straight TkDodo ("Effective React Query Keys") + official v5 `queryOptions` co-location: hierarchical array keys (`['accounts'] → ['accounts','list',filters] → ['accounts','detail',id]`), one key factory per resource, co-located in the same module as the `queryOptions` factories, and exported so consumers can invalidate (`queryClient.invalidateQueries({ queryKey: accountsKeys.all })`). Resource-oriented generated SDKs (openapi-qraft, orval) and the osdrive hand-rolled HttpApiClient wrapper all converge on `[scope, group, endpoint, params]`. **[established]**

### 5. Mutations

`useMutation` takes any `(vars) => Promise`, so the same `runQuery` runner works; react-query ^5.90 ships a `mutationOptions` helper (added mid-2025) mirroring `queryOptions`:

```ts
export const accountsMutations = {
  create: () =>
    mutationOptions({
      mutationKey: [...accountsKeys.all, "create"],
      mutationFn: (input: CreateAccount) =>
        runQuery(Effect.flatMap(Api, (api) => api.accounts.create({ payload: input }))),
    }),
}
```

Invalidation convention: the SDK exports key factories but does **not** invalidate itself — consumers call `queryClient.invalidateQueries({ queryKey: accountsKeys.all })` in `onSuccess` (or the SDK exposes an optional `meta`/callback hook). Baking invalidation into the SDK requires injecting the `QueryClient`, which most hand-rolled SDKs avoid; effect-query also leaves it to the caller. **[established convention; the "SDK stays invalidation-agnostic" stance is majority practice, not a rule]**

### 6. ManagedRuntime placement: module scope, with a context escape hatch

- **Module-scope singleton is the 2026 default for an SDK layer like `FetchHttpClient` + client**: the layer is static (no per-user construction), `ManagedRuntime.make` is lazy and memoized, and `queryOptions` factories must be callable outside React render (route loaders, prefetch), which a context-held runtime cannot serve. effect-query itself does `createEffectQuery(layer)` at module scope; osdrive and bitswired do the same. **[established across surveyed code]**
- React-context-held runtime (lucas-barake's video pattern: `ManagedRuntime.make` in a provider, `useRuntime()` hook, `.dispose()` on unmount) earns its keep only when the layer depends on runtime React state — e.g. an auth token from a provider. For tokens, the common workaround keeping module scope is a mutable `Ref`/`Effect.serviceOption`-based bearer layer (bitswired does exactly this) or `transformClient` reading a token getter. **[established options; recommendation is synthesis]**
- Disposal: for an SPA-lifetime runtime, never calling `runtime.dispose()` is accepted practice (the page teardown is the disposal); wire `dispose` into HMR (`import.meta.hot?.dispose(...)`) to avoid leaking fibers/finalizers across Vite hot reloads. **[HMR-dispose is synthesis/community tip, not documented doctrine]**

**Bottom line**: hand-roll — module-scope `ManagedRuntime`, one `runQuery` doing `runPromiseExit` + `Cause.squash`, per-resource key factories co-located with `queryOptions`/`mutationOptions` factories. Watch `effect-query` as the likely standard once Effect 4 lands; watch `effect-atom` if you ever want to leave react-query.

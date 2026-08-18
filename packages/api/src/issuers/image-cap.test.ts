import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HttpApiBuilder, HttpServer } from "@effect/platform";
import { NodeHttpServer } from "@effect/platform-node";
import { afterAll, assert, beforeAll, describe, it } from "@effect/vitest";
import { MAX_IMAGE_BYTES } from "@mamen/shared/contract";
import { Effect, Layer } from "effect";
import sharp from "sharp";
import { vi } from "vitest";
import { ApiLive } from "../api-live";
import { DatabaseTest } from "../db/test";
import { ClaudeCodeStub } from "../import/test";
import { OutboundStub } from "../net/test";
import { normaliseIssuerImage } from "./image-normalise";

// The whole point of this file is *when* the decode runs, so the pipeline is
// wrapped in a spy. It still delegates to the real implementation — the
// under-cap case has to genuinely produce a stored image for the over-cap case
// to mean anything, and that it records exactly one call is also what proves
// the spy is the function `image.ts` reaches.
//
// The target is spelled as a resolved path, not `"./image-normalise"`: a
// relative specifier here silently fails to match (the factory never runs, the
// import stays real) and the miss is invisible. `import.meta` is the one thing
// available to the hoisted `vi.mock` call, so it's what keeps this portable.
vi.mock(new URL("image-normalise.ts", import.meta.url).pathname, async (importOriginal) => {
  const actual = await importOriginal<typeof import("./image-normalise")>();
  return {
    ...actual,
    normaliseIssuerImage: vi.fn(actual.normaliseIssuerImage),
  };
});
const decodeSpy = vi.mocked(normaliseIssuerImage);

/**
 * A *real* HTTP server on an ephemeral port, not `NodeHttpServer.layerTest`.
 * The cap is enforced by the multipart parser as the request body arrives, so
 * it only fires over a real socket — which is why the rest of the issuer
 * endpoints, tested through `layerTest`, cannot cover it.
 */
const ServerLive = HttpApiBuilder.serve().pipe(
  Layer.provide(ApiLive),
  Layer.provide(ClaudeCodeStub),
  Layer.provide(OutboundStub),
  Layer.provide(DatabaseTest),
  Layer.provideMerge(NodeHttpServer.layer(() => createServer(), { port: 0 })),
);

const tempDirs: string[] = [];

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  process.env.UPLOADS_DIR = undefined;
});

/**
 * Launch a server over an uploads directory of its own and run `f` against it.
 *
 * The directory is per-call because each server also gets its own `:memory:`
 * database, so every test's issuer is id 1 and their filenames would otherwise
 * collide — "what is on disk" has to mean "what *this* test put there" for the
 * over-cap assertion to say anything. Config reads the env at layer build, so
 * setting it before launching is what binds it.
 */
const withServer = <A>(f: (base: string, uploadsDir: string) => Promise<A>) => {
  const uploadsDir = mkdtempSync(join(tmpdir(), "mamen-image-cap-"));
  tempDirs.push(uploadsDir);
  process.env.UPLOADS_DIR = uploadsDir;

  return Effect.gen(function* () {
    const server = yield* HttpServer.HttpServer;
    const { port } = server.address as { port: number };
    return yield* Effect.promise(() => f(`http://127.0.0.1:${port}`, uploadsDir));
  }).pipe(Effect.provide(ServerLive), Effect.scoped, Effect.runPromise);
};

const createIssuer = (base: string) =>
  fetch(`${base}/api/issuers`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Acme",
      firstSeen: "2026-01-15T00:00:00.000Z",
    }),
  }).then((res) => res.json() as Promise<{ id: number }>);

const uploadImage = (base: string, id: number, bytes: Uint8Array<ArrayBuffer>) => {
  const body = new FormData();
  body.append("file", new File([bytes], "logo.png", { type: "image/png" }));
  return fetch(`${base}/api/issuers/${id}/image`, {
    method: "POST",
    body,
    // A refused part leaves the rest of the body unread on the socket, so the
    // connection is unusable afterwards and the next request sent over it
    // hangs. Closing this one keeps a refusal from leaking into the checks
    // that follow it.
    headers: { connection: "close" },
  });
};

const getIssuer = (base: string, id: number) =>
  fetch(`${base}/api/issuers/${id}`).then((res) => res.json() as Promise<{ imageUrl?: string }>);

/**
 * A solid PNG stored uncompressed, so its encoded size tracks its dimensions —
 * the only straightforward way to land a *decodable* image on a chosen side of
 * the cap. Both fixtures are valid images: the over-cap one has to be refused
 * for its size and nothing else, or the test would pass for the wrong reason.
 */
const png = (side: number) =>
  sharp({
    create: {
      width: side,
      height: side,
      channels: 3,
      background: { r: 10, g: 120, b: 220 },
    },
  })
    .png({ compressionLevel: 0 })
    .toBuffer()
    .then((buffer) => new Uint8Array(buffer));

let OVER_CAP_PNG: Uint8Array<ArrayBuffer>;
let UNDER_CAP_PNG: Uint8Array<ArrayBuffer>;

beforeAll(async () => {
  [OVER_CAP_PNG, UNDER_CAP_PNG] = await Promise.all([png(900), png(780)]);
  // They are sized by dimension, so assert the property that actually matters
  // rather than trusting the arithmetic: one is over the cap, the other sits
  // close under it.
  assert.ok(OVER_CAP_PNG.byteLength > MAX_IMAGE_BYTES);
  assert.ok(UNDER_CAP_PNG.byteLength < MAX_IMAGE_BYTES);
  assert.ok(UNDER_CAP_PNG.byteLength > MAX_IMAGE_BYTES * 0.8);
});

describe("the image cap is a pre-decode guard", () => {
  it("is 2 MiB", () => {
    assert.strictEqual(MAX_IMAGE_BYTES, 2 * 1024 * 1024);
  });

  it("refuses an oversized upload before sharp is asked to decode it", async () => {
    decodeSpy.mockClear();

    const { stored, uploadsDir } = await withServer(async (base, servedFrom) => {
      const issuer = await createIssuer(base);
      const res = await uploadImage(base, issuer.id, OVER_CAP_PNG);

      // The parser aborts the request, so the failure is a framework
      // `MultipartError(ReachedLimit: MaxPartSize)` surfacing as a 500,
      // not a declared contract error. What the acceptance criterion
      // pins is the refusal, not which status it wears.
      assert.ok(res.status >= 400, `expected a refusal, got ${res.status}`);

      return {
        stored: (await getIssuer(base, issuer.id)).imageUrl,
        uploadsDir: servedFrom,
      };
    });

    // The cap is a *pre-decode* guard, and this is the assertion that says so:
    // not merely that an oversized upload fails, but that sharp is never handed
    // the bytes. A size check made after decoding would pass every other
    // assertion here and still be the wrong thing.
    assert.strictEqual(decodeSpy.mock.calls.length, 0);

    // Nothing was stored, and the issuer is unchanged. The fixture decodes
    // fine, so had the guard not fired first this upload would have *succeeded*.
    assert.strictEqual(stored, undefined);
    assert.deepStrictEqual(readdirSync(uploadsDir), []);
  });

  it("accepts an upload just under the cap, so the refusal is about size", async () => {
    decodeSpy.mockClear();

    const { imageUrl, uploadsDir } = await withServer(async (base, servedFrom) => {
      const issuer = await createIssuer(base);
      const res = await uploadImage(base, issuer.id, UNDER_CAP_PNG);
      assert.strictEqual(res.status, 200);

      return {
        imageUrl: (await getIssuer(base, issuer.id)).imageUrl as string,
        uploadsDir: servedFrom,
      };
    });

    assert.strictEqual(decodeSpy.mock.calls.length, 1);

    // A 1.8 MiB PNG in, one 128×128 WebP out: the cap bounds the input, never
    // what lands on disk.
    const filename = imageUrl.replace("/uploads/issuers/", "");
    assert.deepStrictEqual(readdirSync(join(uploadsDir, "issuers")), [filename]);
    const meta = await sharp(join(uploadsDir, "issuers", filename)).metadata();
    assert.strictEqual(meta.format, "webp");
    assert.strictEqual(meta.width, 128);
    assert.strictEqual(meta.height, 128);
  });
});

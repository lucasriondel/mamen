import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";
import sharp from "sharp";
import { IMAGE_SIZE, ImageDecodeFailed, normaliseIssuerImage } from "./image-normalise";

/** A solid-colour raster of the given size, encoded in `format`. */
const makeImage = (width: number, height: number, format: "png" | "jpeg" | "gif" | "webp") =>
  sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 200, g: 40, b: 40 },
    },
  })
    .toFormat(format)
    .toBuffer();

const metadataOf = (bytes: Uint8Array) => sharp(bytes).metadata();

const RED = [255, 0, 0] as const;
const GREEN = [0, 255, 0] as const;
const BLUE = [0, 0, 255] as const;

/**
 * A raster split into three equal bands of solid red / green / blue, laid out
 * left-to-right (`"horizontal"`) or top-to-bottom (`"vertical"`).
 *
 * A solid-colour fixture cannot tell a cover-crop from a squash — both come out
 * 128×128 — so the geometry assertions below need an image whose regions are
 * distinguishable.
 */
const makeBandedImage = (width: number, height: number, orientation: "horizontal" | "vertical") => {
  const bands = [RED, GREEN, BLUE];
  const data = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const along = orientation === "horizontal" ? x / width : y / height;
      const [r, g, b] = bands[Math.min(2, Math.floor(along * 3))];
      const offset = (y * width + x) * 3;
      data[offset] = r;
      data[offset + 1] = g;
      data[offset + 2] = b;
    }
  }
  return sharp(data, { raw: { width, height, channels: 3 } })
    .png()
    .toBuffer();
};

/** Decode to raw RGB and read the pixel at (x, y). */
const pixelAt = async (bytes: Uint8Array, x: number, y: number) => {
  const { data, info } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
  const offset = (y * info.width + x) * info.channels;
  return [data[offset], data[offset + 1], data[offset + 2]] as const;
};

/**
 * WebP is lossy by default, so an exact equality check on a decoded pixel is
 * too strict; "which channel dominates" is the property under test and survives
 * the round-trip intact.
 */
const dominantChannel = (pixel: readonly [number, number, number]) =>
  (["r", "g", "b"] as const)[pixel.indexOf(Math.max(...pixel))];

describe("normaliseIssuerImage", () => {
  it.effect("cover-crops a wide image to a 128x128 square", () =>
    Effect.gen(function* () {
      const wide = yield* Effect.promise(() => makeImage(600, 100, "png"));

      const out = yield* normaliseIssuerImage(wide);

      const meta = yield* Effect.promise(() => metadataOf(out));
      assert.strictEqual(meta.width, IMAGE_SIZE);
      assert.strictEqual(meta.height, IMAGE_SIZE);
    }),
  );

  it.effect("cover-crops a tall image to a 128x128 square too", () =>
    Effect.gen(function* () {
      const tall = yield* Effect.promise(() => makeImage(80, 900, "png"));

      const out = yield* normaliseIssuerImage(tall);

      const meta = yield* Effect.promise(() => metadataOf(out));
      assert.strictEqual(meta.width, IMAGE_SIZE);
      assert.strictEqual(meta.height, IMAGE_SIZE);
    }),
  );

  // The tests above pin the output *size*; these pin the output *content*. A
  // distorting resize (`fit: "fill"`) would satisfy every 128×128 assertion
  // while squashing the whole logo into frame, so the crop geometry needs an
  // assertion of its own.
  it.effect("keeps the centre of a wide image and discards the sides", () =>
    Effect.gen(function* () {
      // Cover-scaling 600×100 to fill 128² is a 1.28× zoom (768×128), and the
      // centred 128-wide window then spans x 250–350 of the original — wholly
      // inside the green middle band. A squash would keep red at the left edge
      // and blue at the right.
      const wide = yield* Effect.promise(() => makeBandedImage(600, 100, "horizontal"));

      const out = yield* normaliseIssuerImage(wide);

      for (const x of [0, 64, 127]) {
        const pixel = yield* Effect.promise(() => pixelAt(out, x, 64));
        assert.strictEqual(
          dominantChannel(pixel),
          "g",
          `x=${x} should be inside the green band, got ${pixel.join(",")}`,
        );
      }
    }),
  );

  it.effect("keeps the centre of a tall image and discards top and bottom", () =>
    Effect.gen(function* () {
      const tall = yield* Effect.promise(() => makeBandedImage(100, 600, "vertical"));

      const out = yield* normaliseIssuerImage(tall);

      for (const y of [0, 64, 127]) {
        const pixel = yield* Effect.promise(() => pixelAt(out, 64, y));
        assert.strictEqual(
          dominantChannel(pixel),
          "g",
          `y=${y} should be inside the green band, got ${pixel.join(",")}`,
        );
      }
    }),
  );

  it.effect("upsizes a small image rather than leaving it under 128", () =>
    Effect.gen(function* () {
      const tiny = yield* Effect.promise(() => makeImage(16, 16, "png"));

      const out = yield* normaliseIssuerImage(tiny);

      const meta = yield* Effect.promise(() => metadataOf(out));
      assert.strictEqual(meta.width, IMAGE_SIZE);
      assert.strictEqual(meta.height, IMAGE_SIZE);
    }),
  );

  // Every accepted input format leaves as WebP — that's the whole point of the
  // single stored form, so each allow-listed format is checked, not just PNG.
  for (const format of ["png", "jpeg", "gif", "webp"] as const) {
    it.effect(`re-encodes ${format} input as WebP`, () =>
      Effect.gen(function* () {
        const input = yield* Effect.promise(() => makeImage(200, 200, format));
        // Sanity: the fixture really is in the input format.
        const before = yield* Effect.promise(() => metadataOf(input));
        assert.strictEqual(before.format, format);

        const out = yield* normaliseIssuerImage(input);

        const meta = yield* Effect.promise(() => metadataOf(out));
        assert.strictEqual(meta.format, "webp");
      }),
    );
  }

  it.effect("strips input metadata (EXIF never survives)", () =>
    Effect.gen(function* () {
      const withExif = yield* Effect.promise(() =>
        sharp({
          create: {
            width: 200,
            height: 200,
            channels: 3,
            background: "#123456",
          },
        })
          .withExif({ IFD0: { Copyright: "someone else" } })
          .jpeg()
          .toBuffer(),
      );

      const out = yield* normaliseIssuerImage(withExif);

      const meta = yield* Effect.promise(() => metadataOf(out));
      assert.strictEqual(meta.exif, undefined);
    }),
  );

  it.effect("fails ImageDecodeFailed on bytes that aren't an image", () =>
    Effect.gen(function* () {
      const error = yield* normaliseIssuerImage(new Uint8Array([1, 2, 3, 4])).pipe(Effect.flip);

      assert.ok(error instanceof ImageDecodeFailed);
    }),
  );

  it.effect("fails ImageDecodeFailed on a path that doesn't exist", () =>
    Effect.gen(function* () {
      const error = yield* normaliseIssuerImage("/nonexistent/not-an-image.png").pipe(Effect.flip);

      assert.ok(error instanceof ImageDecodeFailed);
    }),
  );
});

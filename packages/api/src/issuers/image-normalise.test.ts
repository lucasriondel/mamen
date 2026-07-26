import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";
import sharp from "sharp";
import {
	IMAGE_SIZE,
	ImageDecodeFailed,
	normaliseIssuerImage,
} from "./image-normalise";

/** A solid-colour raster of the given size, encoded in `format`. */
const makeImage = (
	width: number,
	height: number,
	format: "png" | "jpeg" | "gif" | "webp",
) =>
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
			const error = yield* normaliseIssuerImage(
				new Uint8Array([1, 2, 3, 4]),
			).pipe(Effect.flip);

			assert.ok(error instanceof ImageDecodeFailed);
		}),
	);

	it.effect("fails ImageDecodeFailed on a path that doesn't exist", () =>
		Effect.gen(function* () {
			const error = yield* normaliseIssuerImage(
				"/nonexistent/not-an-image.png",
			).pipe(Effect.flip);

			assert.ok(error instanceof ImageDecodeFailed);
		}),
	);
});

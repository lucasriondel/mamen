import { Data, Effect } from "effect";
import sharp from "sharp";

/**
 * The one stored form of an issuer image — 128×128 WebP, cover-cropped (the
 * **Normalised issuer image**, ADR 0007). 128 covers the 48px avatar at 2×
 * retina with headroom; cover-crop because the avatar is a circle, so
 * letterboxing a wide logo into it wastes the circle.
 */
export const IMAGE_SIZE = 128;

/** The stored file extension — always WebP, whatever the input format was. */
export const IMAGE_EXT = "webp";

/**
 * The input could not be decoded as an image. Distinct from the MIME
 * allow-list miss: the declared content type was acceptable but the bytes
 * behind it are not a picture (corrupt, truncated, or a lying `Content-Type`).
 * Internal — each call site maps it to its own client-facing error.
 */
export class ImageDecodeFailed extends Data.TaggedError("ImageDecodeFailed")<{
  readonly cause: unknown;
}> {}

/**
 * Decode an image and re-encode it as the **Normalised issuer image**:
 * {@link IMAGE_SIZE}² WebP, cover-cropped from the centre. Returns the encoded
 * bytes; the caller decides where they land, so both acquisition paths (manual
 * upload today, Logo search download next) share one pipeline and there is
 * exactly one class of image on disk.
 *
 * `input` is a path or a buffer — sharp reads either, which is what lets the
 * download path hand over an in-memory response body without touching disk.
 *
 * Notes on the pipeline:
 * - `rotate()` with no argument auto-orients from EXIF, so a phone photo is
 *   cropped the way the user saw it rather than sideways.
 * - `fit: "cover"` scales to fill then crops the overflow, centred — a wide
 *   logo comes out square, never letterboxed.
 * - sharp drops metadata unless asked to keep it, so EXIF (including GPS)
 *   never survives into the stored file.
 * - An animated GIF collapses to its first frame; the avatar is a static
 *   image by design.
 *
 * There is no byte cap here: what sharp is asked to decode is bounded upstream
 * (the multipart parser's 2 MiB `maxFileSize` for uploads, a response cap for
 * the download path), which is where a pre-decode guard has to live to be one.
 */
export const normaliseIssuerImage = (
  input: string | Uint8Array,
): Effect.Effect<Uint8Array, ImageDecodeFailed> =>
  Effect.tryPromise({
    try: () =>
      sharp(input)
        .rotate()
        .resize(IMAGE_SIZE, IMAGE_SIZE, {
          fit: "cover",
          position: "centre",
        })
        .webp()
        .toBuffer(),
    catch: (cause) => new ImageDecodeFailed({ cause }),
  });

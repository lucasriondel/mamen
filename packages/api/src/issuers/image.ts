import { FileSystem, Path } from "@effect/platform";
import type { Multipart } from "@effect/platform";
import { InvalidFileType, type IssuerId } from "@mamen/shared/contract";
import { Clock, Effect } from "effect";
import { UploadsDir } from "../config";
import { IMAGE_EXT, normaliseIssuerImage } from "./image-normalise";

/**
 * The image MIME allow-list (contract §2.4 — jpeg / png / webp / gif). Not
 * expressible in the multipart combinator (`fieldMimeTypes` only splits
 * fields-vs-files), so it's enforced here; a miss fails `InvalidFileType
 * (415)`. Ported verbatim from the old Fastify handler.
 *
 * It remains the gate on what is *accepted*; it no longer decides what is
 * *stored*. Every accepted upload is normalised to WebP (ADR 0007), so the
 * input format's own extension is never used and no MIME→extension map is
 * needed.
 */
const ALLOWED_MIME_TYPES = [
	"image/jpeg",
	"image/png",
	"image/webp",
	"image/gif",
];

/** The stored `imageUrl` for an issuer filename — always root-relative. */
const imageUrlFor = (filename: string) => `/uploads/issuers/${filename}`;

/**
 * Persist an uploaded issuer image as a **Normalised issuer image** and return
 * its root-relative `imageUrl`.
 *
 * The multipart parser has already written the upload to a scoped temp path
 * (auto-cleaned when the request scope closes) and refused anything over
 * `MAX_IMAGE_BYTES` — that cap is the pre-decode guard, so sharp is only ever
 * asked to open something already bounded. This validates the MIME type,
 * re-encodes the upload to 128×128 cover-cropped WebP, writes *that* to
 * `uploads/issuers/issuer-{id}-{ts}.webp` (creating the directory if needed),
 * deletes the issuer's previous image (best-effort), and yields the new
 * `imageUrl`. The `id`/timestamp filename scheme matches the old server so
 * existing on-disk files keep their shape; only the extension is now fixed.
 *
 * The original upload is never copied anywhere — the temp file is all that
 * ever held it, and the request scope unlinks it.
 *
 * Fails `InvalidFileType` when the content type isn't in the allow-list, and
 * *also* when the bytes don't decode as an image: a `Content-Type` is
 * client-supplied, so an accepted header over a corrupt or mislabelled body is
 * still "we don't support this media", not a server fault. Any filesystem error
 * is an infrastructure defect (dies → 500), not client-facing.
 */
export const persistIssuerImage = (
	id: typeof IssuerId.Type,
	file: Multipart.PersistedFile,
	previousImageUrl: string | undefined,
): Effect.Effect<
	string,
	InvalidFileType,
	FileSystem.FileSystem | Path.Path
> =>
	Effect.gen(function* () {
		const invalidFileType = new InvalidFileType({
			allowed: ALLOWED_MIME_TYPES,
			received: file.contentType,
		});
		if (!ALLOWED_MIME_TYPES.includes(file.contentType)) {
			return yield* Effect.fail(invalidFileType);
		}

		// Decode + re-encode before touching the uploads dir, so a body that
		// isn't really an image leaves nothing behind.
		const normalised = yield* normaliseIssuerImage(file.path).pipe(
			Effect.mapError(() => invalidFileType),
		);

		const fs = yield* FileSystem.FileSystem;
		const path = yield* Path.Path;
		// The config is default-backed, so a read failure is a misconfiguration
		// defect (dies → 500), never a client-facing error — keeps this Effect's
		// error channel to the domain `InvalidFileType`.
		const uploadsDir = yield* Effect.orDie(UploadsDir);

		const issuersDir = path.join(uploadsDir, "issuers");
		yield* fs.makeDirectory(issuersDir, { recursive: true }).pipe(Effect.orDie);

		const now = yield* Clock.currentTimeMillis;
		const filename = `issuer-${id}-${now}.${IMAGE_EXT}`;
		const dest = path.join(issuersDir, filename);

		// The normalised bytes are what lands on disk — the temp upload is never
		// moved or copied, so nothing keeps the original.
		yield* fs.writeFile(dest, normalised).pipe(Effect.orDie);

		// Delete the previous image if the stored path resolves under this dir.
		// Best-effort: a missing/foreign file is ignored (matches the old unlink
		// that swallowed errors), and any other FS error dies.
		if (previousImageUrl !== undefined) {
			yield* deletePreviousImage(fs, path, uploadsDir, previousImageUrl);
		}

		return imageUrlFor(filename);
	});

/**
 * Remove an issuer image given its stored root-relative `imageUrl`, resolving
 * the on-disk path under {@link UploadsDir}. Best-effort — a missing file is a
 * no-op (the old server swallowed unlink errors); other FS errors die (500).
 * Used by `deleteImage` and to clean up the previous file on re-upload.
 */
export const deleteIssuerImage = (
	imageUrl: string,
): Effect.Effect<void, never, FileSystem.FileSystem | Path.Path> =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const path = yield* Path.Path;
		const uploadsDir = yield* Effect.orDie(UploadsDir);
		yield* deletePreviousImage(fs, path, uploadsDir, imageUrl);
	});

/**
 * Shared unlink: strip the leading `/uploads/` from the stored URL, join under
 * `uploadsDir`, and remove it. `remove` with no error on ENOENT keeps it a
 * no-op when the file is already gone; any other error dies.
 */
const deletePreviousImage = (
	fs: FileSystem.FileSystem,
	path: Path.Path,
	uploadsDir: string,
	imageUrl: string,
) => {
	const relative = imageUrl.replace(/^\/uploads\//, "");
	const target = path.join(uploadsDir, relative);
	return fs.remove(target).pipe(
		Effect.catchAll(() => Effect.void),
	);
};

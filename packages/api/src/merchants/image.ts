import { FileSystem, Path } from "@effect/platform";
import type { Multipart } from "@effect/platform";
import { InvalidFileType, type MerchantId } from "@mamen/shared/contract";
import { Clock, Effect } from "effect";
import { UploadsDir } from "../config";

/**
 * The image MIME allow-list and its file extensions (contract §2.4 — jpeg / png
 * / webp / gif). Not expressible in the multipart combinator (`fieldMimeTypes`
 * only splits fields-vs-files), so it's enforced here; a miss fails
 * `InvalidFileType (415)`. Ported verbatim from the old Fastify handler.
 */
const MIME_TO_EXT: Record<string, string> = {
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/webp": "webp",
	"image/gif": "gif",
};

const ALLOWED_MIME_TYPES = Object.keys(MIME_TO_EXT);

/** The stored `imageUrl` for a merchant filename — always root-relative. */
const imageUrlFor = (filename: string) => `/uploads/merchants/${filename}`;

/**
 * Persist an uploaded merchant image and return its root-relative `imageUrl`.
 *
 * The multipart parser has already written the upload to a scoped temp path
 * (auto-cleaned when the request scope closes). This validates the MIME type,
 * moves the temp file to `uploads/merchants/merchant-{id}-{ts}.{ext}` (creating
 * the directory if needed), deletes the merchant's previous image (best-effort),
 * and yields the new `imageUrl`. The `id`/timestamp filename scheme matches the
 * old server so existing on-disk files keep their shape.
 *
 * Fails `InvalidFileType` when the content type isn't in the allow-list. Any
 * filesystem error is an infrastructure defect (dies → 500), not client-facing.
 */
export const persistMerchantImage = (
	id: typeof MerchantId.Type,
	file: Multipart.PersistedFile,
	previousImageUrl: string | undefined,
): Effect.Effect<
	string,
	InvalidFileType,
	FileSystem.FileSystem | Path.Path
> =>
	Effect.gen(function* () {
		const ext = MIME_TO_EXT[file.contentType];
		if (ext === undefined) {
			return yield* Effect.fail(
				new InvalidFileType({
					allowed: ALLOWED_MIME_TYPES,
					received: file.contentType,
				}),
			);
		}

		const fs = yield* FileSystem.FileSystem;
		const path = yield* Path.Path;
		// The config is default-backed, so a read failure is a misconfiguration
		// defect (dies → 500), never a client-facing error — keeps this Effect's
		// error channel to the domain `InvalidFileType`.
		const uploadsDir = yield* Effect.orDie(UploadsDir);

		const merchantsDir = path.join(uploadsDir, "merchants");
		yield* fs.makeDirectory(merchantsDir, { recursive: true }).pipe(Effect.orDie);

		const now = yield* Clock.currentTimeMillis;
		const filename = `merchant-${id}-${now}.${ext}`;
		const dest = path.join(merchantsDir, filename);

		// `rename` fails across devices; `copy` + the temp file's scope finalizer
		// (which unlinks the source) is the portable move.
		yield* fs.copyFile(file.path, dest).pipe(Effect.orDie);

		// Delete the previous image if the stored path resolves under this dir.
		// Best-effort: a missing/foreign file is ignored (matches the old unlink
		// that swallowed errors), and any other FS error dies.
		if (previousImageUrl !== undefined) {
			yield* deletePreviousImage(fs, path, uploadsDir, previousImageUrl);
		}

		return imageUrlFor(filename);
	});

/**
 * Remove a merchant image given its stored root-relative `imageUrl`, resolving
 * the on-disk path under {@link UploadsDir}. Best-effort — a missing file is a
 * no-op (the old server swallowed unlink errors); other FS errors die (500).
 * Used by `deleteImage` and to clean up the previous file on re-upload.
 */
export const deleteMerchantImage = (
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

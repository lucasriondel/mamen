import { Config } from "effect";

/** Server config read from the environment, with sensible dev defaults. */
export const Port = Config.integer("PORT").pipe(Config.withDefault(5500));

/** Sqlite database file; defaults to `mamen.db` in the working directory. */
export const DbPath = Config.string("DB_PATH").pipe(
	Config.withDefault("mamen.db"),
);

/**
 * Directory that backs the `/uploads/*` static route and holds issuer images
 * (under `uploads/issuers/`). Defaults to `uploads` in the working directory,
 * mirroring the old server's on-disk location. `imageUrl` is always stored as a
 * root-relative `/uploads/...` path independent of where this resolves.
 */
export const UploadsDir = Config.string("UPLOADS_DIR").pipe(
	Config.withDefault("uploads"),
);

/** Comma-separated allowed CORS origins; defaults to the Vite dev server. */
export const CorsOrigins = Config.string("CORS_ORIGINS").pipe(
	Config.withDefault("http://localhost:5000"),
	Config.map((raw) => raw.split(",").map((s) => s.trim())),
);

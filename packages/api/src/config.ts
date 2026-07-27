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

/**
 * The Google Programmable Search credentials that back **Logo search** (ADR
 * 0007): an API key and a search-engine id. Both are `Config.option` and
 * **neither has a default** — unlike everything else in this file, there is no
 * harmless guess. Absent, the feature reports itself *unconfigured* and refuses
 * before spending anything; see `docs/operations/logo-search-setup.md`.
 *
 * The key is `Config.redacted` so it cannot be logged by accident. Keeping it
 * out of the browser is the entire reason the search is proxied server-side
 * rather than queried from the client.
 */
export const GoogleCseKey = Config.option(Config.redacted("GOOGLE_CSE_KEY"));

/** The Programmable Search engine id (`cx`) — not secret, but equally required. */
export const GoogleCseCx = Config.option(Config.string("GOOGLE_CSE_CX"));

/** Comma-separated allowed CORS origins; defaults to the Vite dev server. */
export const CorsOrigins = Config.string("CORS_ORIGINS").pipe(
	Config.withDefault("http://localhost:5070"),
	Config.map((raw) => raw.split(",").map((s) => s.trim())),
);

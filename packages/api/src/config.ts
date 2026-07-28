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
 * The logo.dev publishable token (`pk_…`) that backs **Logo search** (ADR
 * 0007, amended): every `img.logo.dev` lookup carries it as `token`. It is
 * `Config.option` and **has no default** — unlike everything else in this
 * file, there is no harmless guess. Absent, the feature reports itself
 * *unconfigured* and refuses before spending anything; see
 * `docs/operations/logo-search-setup.md`.
 *
 * "Publishable" means it is not a secret — logo.dev designs it to appear in
 * `<img>` tags. It still lives server-side only, so the client contract stays
 * provider-agnostic and there is exactly one place to configure.
 */
export const LogodevToken = Config.option(Config.string("LOGODEV_TOKEN"));

/** Comma-separated allowed CORS origins; defaults to the Vite dev server. */
export const CorsOrigins = Config.string("CORS_ORIGINS").pipe(
	Config.withDefault("http://localhost:5070"),
	Config.map((raw) => raw.split(",").map((s) => s.trim())),
);

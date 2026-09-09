import { API_DEV_PORT, WEB_DEV_PORT, WEB_PORTLESS_ORIGIN } from "@mamen/shared/ports";
import { Config } from "effect";

/**
 * Server config read from the environment, with sensible dev defaults.
 *
 * The two ports below are the registry's rows for mamen
 * (`@mamen/shared/ports`), not literals: the web dev server proxies to one of
 * them and the other is where its own requests come from, so a number changed
 * in one place and not the other is a dev setup that half works.
 */
export const Port = Config.integer("PORT").pipe(Config.withDefault(API_DEV_PORT));

/** Sqlite database file; defaults to `mamen.db` in the working directory. */
export const DbPath = Config.string("DB_PATH").pipe(Config.withDefault("mamen.db"));

/**
 * Directory that backs the `/uploads/*` static route and holds issuer images
 * (under `uploads/issuers/`). Defaults to `uploads` in the working directory,
 * mirroring the old server's on-disk location. `imageUrl` is always stored as a
 * root-relative `/uploads/...` path independent of where this resolves.
 */
export const UploadsDir = Config.string("UPLOADS_DIR").pipe(Config.withDefault("uploads"));

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

/**
 * The AES-256-GCM key that encrypts stored credentials (issue #117, ADR 0011) —
 * **64 hex characters**, i.e. 32 bytes:
 * `openssl rand -hex 32`.
 *
 * `Config.redacted`, so a value that reaches a log line or an error prints as
 * `<redacted>` rather than as the key to every credential in the database.
 *
 * `Config.option` and **no default**, like {@link LogodevToken} and for the
 * opposite reason: a default here would be a *published* encryption key, which
 * is encryption in name only. Absent, the API still starts and every other
 * endpoint works — a fresh install has no credentials to read — but storing one
 * fails as a 500 and stored ones read back as present-but-unreadable, which is
 * the same state a rotated key produces and is told to the operator the same
 * way.
 *
 * Rotating it does not re-encrypt anything: the stored blobs become unreadable
 * and are re-pasted. See DEPLOY.md.
 */
export const TokenEncryptionKey = Config.option(Config.redacted("TOKEN_ENCRYPTION_KEY"));

/**
 * Comma-separated allowed CORS origins; defaults to the web dev server, under
 * both the spellings it is reachable by.
 *
 * The package has two ways to be run and the browser's origin differs between
 * them: the registry's row when run directly (`PORTLESS=0 bun dev:app`), and
 * the portless hostname when run behind the proxy (`portless.json`). Both are
 * defaulted because the default's whole job is that a fresh clone works
 * without an `.env` — naming only one makes the other's requests fail
 * preflight, which reads as a broken API rather than a missing variable.
 *
 * Unused in production, where the SPA and the API share an origin.
 */
export const CorsOrigins = Config.string("CORS_ORIGINS").pipe(
  Config.withDefault([`http://localhost:${WEB_DEV_PORT}`, WEB_PORTLESS_ORIGIN].join(",")),
  Config.map((raw) => raw.split(",").map((s) => s.trim())),
);

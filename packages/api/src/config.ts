import { Config } from "effect";

/** Server config read from the environment, with sensible dev defaults. */
export const Port = Config.integer("PORT").pipe(Config.withDefault(3000));

/** Sqlite database file; defaults to `mamen.db` in the working directory. */
export const DbPath = Config.string("DB_PATH").pipe(
	Config.withDefault("mamen.db"),
);

/** Comma-separated allowed CORS origins; defaults to the Vite dev server. */
export const CorsOrigins = Config.string("CORS_ORIGINS").pipe(
	Config.withDefault("http://localhost:5173"),
	Config.map((raw) => raw.split(",").map((s) => s.trim())),
);

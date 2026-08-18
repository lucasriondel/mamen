import { basename, isAbsolute, join } from "node:path";

/** Why the seeder refused to run at all — one reason per refusal, no free text. */
export type SeedRefusal = "no-path" | "many-paths" | "app-database";

/** The resolved target, or the refusal that stopped it being one. */
export type SeedTarget =
	| { readonly ok: true; readonly path: string }
	| {
			readonly ok: false;
			readonly reason: SeedRefusal;
			readonly message: string;
	  };

/** What the command line and the environment offered. */
export type SeedInvocation = {
	/** `process.argv.slice(2)` — the positional path plus any flags. */
	readonly argv: ReadonlyArray<string>;
	readonly env: Record<string, string | undefined>;
	readonly cwd: string;
};

/** The API's database file when `DB_PATH` is unset — {@link DbPath}'s default. */
const DEFAULT_DB_FILE = "mamen.db";

/** The one way past the app-database refusal. */
const FORCE = "--force";

const USAGE = "bun run seed:demo <path/to/demo.db>";

/**
 * Decide where the demo seed may write (issue #139).
 *
 * The seeder is destructive — it clears the tables it owns before writing them —
 * so the acceptance criterion is that it "cannot touch a developer's own
 * database by default". Two rules make that true, and both live here rather than
 * in the script's body so they can be reasoned about without a filesystem:
 *
 * - **The path is always explicit.** There is no default target and no
 *   `DB_PATH` fallback: a seeder that guesses is a seeder that eventually
 *   guesses the file holding real statements. Exactly one path, so a typo that
 *   produces two is refused rather than silently resolved to the first.
 * - **The app's own database is refused by name**, wherever it sits. The
 *   comparison is on the *file name* (`DB_PATH`'s basename, `mamen.db` by
 *   default), not on a resolved path, because the same file is reachable as
 *   `mamen.db` from `packages/api`, as `packages/api/mamen.db` from the repo
 *   root, and under any number of symlinks — and the seeder is run from both.
 *   A false positive here costs one `--force`; a false negative costs the
 *   developer's history.
 */
export const resolveSeedTarget = ({
	argv,
	env,
	cwd,
}: SeedInvocation): SeedTarget => {
	const paths = argv.filter((arg) => !arg.startsWith("-"));
	const force = argv.includes(FORCE);

	if (paths.length === 0)
		return {
			ok: false,
			reason: "no-path",
			message: `No database path given. Usage: ${USAGE}`,
		};

	if (paths.length > 1)
		return {
			ok: false,
			reason: "many-paths",
			message: `Expected one database path, got ${paths.length} (${paths.join(", ")}). Usage: ${USAGE}`,
		};

	const [target] = paths;
	const appDbFile = basename(env.DB_PATH ?? DEFAULT_DB_FILE);

	if (!force && basename(target) === appDbFile)
		return {
			ok: false,
			reason: "app-database",
			message: `Refusing to seed ${target}: ${appDbFile} is the API's own database, and seeding clears what it writes. Pass another path, or ${FORCE} if that really is the file you mean.`,
		};

	return { ok: true, path: isAbsolute(target) ? target : join(cwd, target) };
};

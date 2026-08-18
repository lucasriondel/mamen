import { assert, describe, it } from "@effect/vitest";
import { resolveSeedTarget } from "./target";

/**
 * The demo seeder writes to the path it is handed and to nothing else (issue
 * #139). Both halves of that are decided here, before any layer is built or any
 * file opened, so the refusal is a pure function of the command line rather than
 * something a wiring mistake could route around.
 */

const resolve = (
	argv: ReadonlyArray<string>,
	env: Record<string, string> = {},
) => resolveSeedTarget({ argv, env, cwd: "/repo" });

describe("resolveSeedTarget", () => {
	it("refuses when no path is given at all", () => {
		const target = resolve([]);
		assert.strictEqual(target.ok, false);
		assert.strictEqual(target.ok === false && target.reason, "no-path");
	});

	it("resolves a relative path against the working directory", () => {
		const target = resolve(["demo/demo.db"]);
		assert.strictEqual(target.ok, true);
		assert.strictEqual(target.ok === true && target.path, "/repo/demo/demo.db");
	});

	it("keeps an absolute path as it is", () => {
		const target = resolve(["/tmp/demo.db"]);
		assert.strictEqual(target.ok === true && target.path, "/tmp/demo.db");
	});

	it("refuses two paths rather than guessing which one is meant", () => {
		const target = resolve(["one.db", "two.db"]);
		assert.strictEqual(target.ok === false && target.reason, "many-paths");
	});

	it("refuses the API's own database file, wherever it sits", () => {
		// The developer's real statements live in a file with this name. The seeder
		// wipes what it seeds, so hitting it is data loss, and it is reachable from
		// the repo root and from the package alike.
		for (const path of [
			"mamen.db",
			"packages/api/mamen.db",
			"/elsewhere/mamen.db",
		]) {
			const target = resolve([path]);
			assert.strictEqual(
				target.ok === false && target.reason,
				"app-database",
				path,
			);
		}
	});

	it("refuses whatever DB_PATH names, not just the default name", () => {
		const target = resolve(["work/finances.sqlite"], {
			DB_PATH: "/home/dev/finances.sqlite",
		});
		assert.strictEqual(target.ok === false && target.reason, "app-database");
	});

	it("lets --force through, so the refusal is a guard and not a wall", () => {
		const target = resolve(["mamen.db", "--force"]);
		assert.strictEqual(target.ok === true && target.path, "/repo/mamen.db");
	});

	it("does not read a flag as the path", () => {
		assert.strictEqual(resolve(["--force"]).ok, false);
	});

	it("says what it refused and how to get past it", () => {
		const target = resolve([]);
		assert.match(target.ok === false ? target.message : "", /seed:demo/);

		const app = resolve(["mamen.db"]);
		assert.match(app.ok === false ? app.message : "", /--force/);
	});
});

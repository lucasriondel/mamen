import { defineConfig } from "vitest/config";

// Effect packages pin vitest 3.2.4 (@effect/vitest 0.29.0 breaks on vitest 4).
// Tests run on Node (not Bun): v8 coverage needs the Node inspector, and the
// sqlite test layer is @effect/sql-sqlite-node. See the stack survey.
export default defineConfig({
	test: {
		environment: "node",
		globals: false,
		setupFiles: ["./vitest.setup.ts"],
		// Fake timers interfere with @effect/vitest's TestClock; disable them.
		fakeTimers: { toFake: undefined },
		coverage: {
			provider: "v8",
			include: ["src/**"],
			// Runtime bootstrap/wiring — exercised via the running server, not
			// unit tests; kept out of the gate.
			exclude: [
				"src/index.ts",
				"src/server.ts",
				"src/config.ts",
				"src/api-live.ts",
				// Prod Bun sqlite layer — needs the Bun runtime + a real DB file,
				// so it's exercised by the running server, not Node-run vitest. The
				// data layer's logic is covered by the `:memory:` test layer.
				"src/db/sql.ts",
			],
			// Count Layer-only / schema-only modules no test imports yet.
			all: true,
			// Real gate, settled by the accounts port (#11): the vertical slice
			// lands at 100% line/fn/stmt, 95% branch. Set with headroom so a port
			// that transiently dips still passes, but a real regression fails.
			thresholds: {
				lines: 90,
				functions: 90,
				statements: 90,
				branches: 85,
			},
		},
	},
});

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
			],
			// Count Layer-only / schema-only modules no test imports yet.
			all: true,
			// Provisional gate — the threshold number is still open on the map;
			// raise it as resources are ported.
			thresholds: {
				lines: 70,
				functions: 70,
				statements: 70,
				branches: 60,
			},
		},
	},
});

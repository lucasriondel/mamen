import { defineConfig } from "vitest/config";

// Pinned to vitest 3.2.4 to match @effect/vitest 0.29.0 (see the stack survey).
// The SDK's runtime is exercised through the server integration tests in
// @mamen/api; unit coverage here is added as the export surface grows.
export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    fakeTimers: { toFake: undefined },
    // No unit tests yet — the runtime is covered via @mamen/api's
    // integration tests. Don't fail the suite on an empty package.
    passWithNoTests: true,
    coverage: {
      provider: "v8",
      include: ["src/**"],
    },
  },
});

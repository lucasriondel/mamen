import { defineConfig } from "vitest/config";

// Pinned to vitest 3.2.4 to match the other workspace packages (see the stack
// survey). Nothing here needs a DOM or fake timers: this package is pure
// values, so the suite is plain node.
export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    // The contract schemas are exercised through @mamen/api's integration
    // tests; what lives here is coverage of the package's own constants.
    passWithNoTests: true,
  },
});

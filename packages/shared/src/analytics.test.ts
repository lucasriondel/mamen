import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ANALYTICS } from "./analytics";
import * as packageRoot from "./index";

const source = readFileSync(fileURLToPath(new URL("./analytics.ts", import.meta.url)), "utf8");

describe("ANALYTICS", () => {
  it("loads the tracker over https from the self-hosted instance", () => {
    expect(ANALYTICS.src).toMatch(/^https:\/\/[^/]+\/script\.js$/);
  });

  it("names one website, by Umami's uuid", () => {
    expect(ANALYTICS.websiteId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("counts on the public host only", () => {
    // Without it every self-hosted copy would report into this dashboard.
    expect(ANALYTICS.domains).toBe("mamen.gousse.cool");
  });

  it("is exported from the package root", () => {
    expect(packageRoot.ANALYTICS).toBe(ANALYTICS);
  });

  it("imports nothing, so a build-time renderer can read it", () => {
    expect(source).not.toMatch(/^\s*import\b/m);
    expect(source).not.toMatch(/\brequire\(/);
  });
});

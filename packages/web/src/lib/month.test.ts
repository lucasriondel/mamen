import { describe, expect, it } from "vitest";
import { monthKey } from "./month";

describe("monthKey", () => {
  it("pads the month to two digits", () => {
    expect(monthKey(new Date("2026-03-15T12:00:00Z"))).toBe("2026-03");
    expect(monthKey(new Date("2026-11-01T00:00:00Z"))).toBe("2026-11");
  });

  // The whole point of the key: it reads the instant in UTC, so the first day of
  // a month stays in that month whatever offset the viewer is on — the same
  // bucket the server's month filter puts the row in (issue #87).
  it("reads the instant in UTC, not the viewer's local day", () => {
    expect(monthKey(new Date("2026-04-01T00:00:00Z"))).toBe("2026-04");
    expect(monthKey(new Date("2026-03-31T23:59:59.999Z"))).toBe("2026-03");
  });
});

import { describe, expect, it } from "vitest";
import { formatExtractionTime } from "./format-extraction-time";

describe("formatExtractionTime", () => {
  it("renders sub-second durations as whole milliseconds", () => {
    expect(formatExtractionTime(0)).toBe("0ms");
    expect(formatExtractionTime(12.4)).toBe("12ms");
    expect(formatExtractionTime(999)).toBe("999ms");
  });

  it("switches to seconds with one decimal at the 1s boundary", () => {
    expect(formatExtractionTime(1000)).toBe("1.0s");
    expect(formatExtractionTime(12_345)).toBe("12.3s");
  });

  it("keeps a long extraction readable rather than padding zeros", () => {
    expect(formatExtractionTime(184_200)).toBe("184.2s");
  });
});

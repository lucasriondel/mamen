import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { setViewportWidth } from "@/test/match-media";
import { useMediaQuery } from "./use-media-query";

describe("useMediaQuery", () => {
  beforeEach(() => {
    setViewportWidth(0);
  });

  it("reports whether the query matches right now", () => {
    setViewportWidth(1440);
    expect(renderHook(() => useMediaQuery("(min-width: 1280px)")).result.current).toBe(true);

    setViewportWidth(900);
    expect(renderHook(() => useMediaQuery("(min-width: 1280px)")).result.current).toBe(false);
  });

  // The first paint is what decides whether a surface exists at all, so the
  // answer has to be right on it — a hook that started `false` and corrected
  // itself in an effect would mount the narrow layout on every load and then
  // swap it, which is a flash on the wide one and a wasted mount on both.
  it("answers on the first render, not after an effect", () => {
    setViewportWidth(1440);
    const renders: boolean[] = [];
    renderHook(() => {
      const matches = useMediaQuery("(min-width: 1280px)");
      renders.push(matches);
      return matches;
    });
    expect(renders[0]).toBe(true);
  });
});

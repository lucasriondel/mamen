import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useColumnVisibility } from "./use-column-visibility";

const STORAGE_KEY = "mamen:transactions:column-visibility";

describe("useColumnVisibility", () => {
  beforeEach(() => window.localStorage.clear());

  it("starts with everything visible when nothing is stored", () => {
    const { result } = renderHook(() => useColumnVisibility());
    expect(result.current.columnVisibility).toEqual({});
  });

  it("restores a stored preference", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ notes: false }));
    const { result } = renderHook(() => useColumnVisibility());
    expect(result.current.columnVisibility).toEqual({ notes: false });
  });

  it("persists a change", () => {
    const { result } = renderHook(() => useColumnVisibility());

    act(() => result.current.setColumnVisibility({ account: false }));

    expect(result.current.columnVisibility).toEqual({ account: false });
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify({ account: false }));
  });

  it("supports the updater form TanStack passes", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ notes: false }));
    const { result } = renderHook(() => useColumnVisibility());

    act(() =>
      result.current.setColumnVisibility((prev) => ({
        ...prev,
        issuer: false,
      })),
    );

    expect(result.current.columnVisibility).toEqual({
      notes: false,
      issuer: false,
    });
  });

  it("resets to everything visible", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ notes: false }));
    const { result } = renderHook(() => useColumnVisibility());

    act(() => result.current.reset());

    expect(result.current.columnVisibility).toEqual({});
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("{}");
  });

  // A stale id could otherwise hide a column the menu no longer lists, leaving
  // no way to bring it back.
  it("drops stored ids that are no longer toggleable", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ notes: false, gone: false, amount: false }),
    );
    const { result } = renderHook(() => useColumnVisibility());
    expect(result.current.columnVisibility).toEqual({ notes: false });
  });

  it("falls back to everything visible on an unparseable value", () => {
    window.localStorage.setItem(STORAGE_KEY, "not json");
    const { result } = renderHook(() => useColumnVisibility());
    expect(result.current.columnVisibility).toEqual({});
  });
});

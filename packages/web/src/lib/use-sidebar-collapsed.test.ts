import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { SIDEBAR_COLLAPSED_STORAGE_KEY, useSidebarCollapsed } from "./use-sidebar-collapsed";

/**
 * The sidebar's collapsed flag, persisted (issue #106).
 *
 * The asymmetry is the point: only a stored `true` collapses. The sidebar is
 * the app's whole navigation surface, so a value that cannot be read — absent,
 * truncated, hand-edited, written by a future version that stores something
 * else there — must resolve to *open*. There is no state a corrupt entry can
 * leave the user in where they cannot navigate.
 */

/**
 * Run `body` against a stand-in `window.localStorage`.
 *
 * jsdom's `Storage` is a proxy that swallows `vi.spyOn` — the spy installs and
 * never fires — so a test that needs storage to misbehave has to replace the
 * object outright rather than patch a method on it.
 */
function withStorage(stub: Partial<Storage>, body: () => void): void {
  const real = window.localStorage;
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: { getItem: () => null, setItem: () => {}, ...stub },
  });
  try {
    body();
  } finally {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: real,
    });
  }
}

describe("useSidebarCollapsed", () => {
  beforeEach(() => window.localStorage.clear());

  it("starts open when nothing is stored", () => {
    const { result } = renderHook(() => useSidebarCollapsed());
    expect(result.current.collapsed).toBe(false);
  });

  it("restores a stored collapse", () => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, "true");
    const { result } = renderHook(() => useSidebarCollapsed());
    expect(result.current.collapsed).toBe(true);
  });

  it("persists a collapse, and the re-open after it", () => {
    const { result } = renderHook(() => useSidebarCollapsed());

    act(() => result.current.toggle());

    expect(result.current.collapsed).toBe(true);
    expect(window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY)).toBe("true");

    act(() => result.current.toggle());

    expect(result.current.collapsed).toBe(false);
    expect(window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY)).toBe("false");
  });

  it("survives a remount, which is what persistence is for", () => {
    const first = renderHook(() => useSidebarCollapsed());
    act(() => first.result.current.toggle());
    first.unmount();

    const { result } = renderHook(() => useSidebarCollapsed());
    expect(result.current.collapsed).toBe(true);
  });

  it.each([
    ["unparseable", "not json"],
    ["the wrong type", '"true"'],
    ["a stale shape", '{"collapsed":true}'],
    ["null", "null"],
    ["empty", ""],
  ])("resolves to open on %s", (_why, stored) => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, stored);
    const { result } = renderHook(() => useSidebarCollapsed());
    expect(result.current.collapsed).toBe(false);
  });

  it("resolves to open when storage itself refuses to be read", () => {
    withStorage(
      {
        getItem: () => {
          throw new Error("SecurityError: storage is blocked");
        },
      },
      () => {
        const { result } = renderHook(() => useSidebarCollapsed());
        expect(result.current.collapsed).toBe(false);
      },
    );
  });

  it("keeps working when the write is refused", () => {
    withStorage(
      {
        setItem: () => {
          throw new Error("QuotaExceededError");
        },
      },
      () => {
        const { result } = renderHook(() => useSidebarCollapsed());
        // The preference just doesn't survive a reload; the session still
        // collapses.
        expect(() => act(() => result.current.toggle())).not.toThrow();
        expect(result.current.collapsed).toBe(true);
      },
    );
  });

  it("reads storage once, on mount", () => {
    let reads = 0;
    withStorage(
      {
        getItem: () => {
          reads += 1;
          return "true";
        },
      },
      () => {
        const { rerender, result } = renderHook(() => useSidebarCollapsed());
        const afterMount = reads;
        rerender();
        act(() => result.current.toggle());

        // Storage is read to seed the state and never again: a read per render
        // would race the hook's own writes and could flip the panel under the
        // user mid-interaction.
        expect(afterMount).toBe(1);
        expect(reads).toBe(1);
        expect(result.current.collapsed).toBe(false);
      },
    );
  });
});

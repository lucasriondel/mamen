import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  IMPORT_SPLIT_RATIO_STORAGE_KEY,
  MAX_SPLIT_RATIO,
  MIN_SPLIT_RATIO,
  STATEMENT_SPLIT_RATIO_STORAGE_KEY,
  useSplitRatio,
} from "./use-split-ratio";

/**
 * The import wizard's divider position, persisted (issue #210, PRD #208).
 *
 * The asymmetry mirrors the sidebar's collapsed flag: only a stored number the
 * divider could actually have produced is restored. Everything else — no entry,
 * unparseable text, the wrong type, a ratio outside the range the divider
 * clamps to, storage that refuses to be read — resolves to *the step's own
 * default*, because a layout preference nobody can decode must never be able to
 * leave a pane at a width that hides what is in it.
 *
 * The other half of the contract is that an *unread* preference is not a
 * written one: until the user drags, the step's fallback is what shows and
 * nothing is stored — which is what lets each step keep its own default while
 * one drag replaces both.
 */

/**
 * Run `body` against a stand-in `window.localStorage`.
 *
 * jsdom's `Storage` is a proxy that swallows `vi.spyOn` — the spy installs and
 * never fires — so a test that needs storage to misbehave has to replace the
 * object outright rather than patch a method on it. (The same helper as
 * `lib/use-sidebar-collapsed.test.ts`, for the same reason.)
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

/** A step's own default, distinct from anything the cases store. */
const FALLBACK = 0.6;

describe("useSplitRatio", () => {
  beforeEach(() => window.localStorage.clear());

  it("falls back to the step's default when nothing is stored", () => {
    const { result } = renderHook(() => useSplitRatio(FALLBACK));
    expect(result.current.ratio).toBe(FALLBACK);
  });

  it("stores nothing until the user drags, so each step keeps its own default", () => {
    renderHook(() => useSplitRatio(FALLBACK));
    expect(window.localStorage.getItem(IMPORT_SPLIT_RATIO_STORAGE_KEY)).toBeNull();
  });

  it("restores a stored ratio over the step's default", () => {
    window.localStorage.setItem(IMPORT_SPLIT_RATIO_STORAGE_KEY, "0.35");
    const { result } = renderHook(() => useSplitRatio(FALLBACK));
    expect(result.current.ratio).toBe(0.35);
  });

  it("gives one stored ratio to every step, whatever that step's default is", () => {
    window.localStorage.setItem(IMPORT_SPLIT_RATIO_STORAGE_KEY, "0.35");
    // The user's drag is a preference, not a per-screen setting: a second step
    // asking with its own fallback is answered with what they chose.
    expect(renderHook(() => useSplitRatio(FALLBACK)).result.current.ratio).toBe(0.35);
    expect(renderHook(() => useSplitRatio(0.5)).result.current.ratio).toBe(0.35);
  });

  /**
   * A screen with *two* dividers on it — the three-pane mapping of issue #219 —
   * asks two questions, and one stored answer would lock the pair together: a
   * drag on either would jump the other, since both read the same key on the
   * next render. So the reference pane's divider names a key of its own, and
   * "one preference for the divider every step shares" survives a step that has
   * a second one.
   */
  it("keeps a second divider's position apart from the shared one", () => {
    const shared = renderHook(() => useSplitRatio(FALLBACK));
    const statement = renderHook(() => useSplitRatio(0.4, STATEMENT_SPLIT_RATIO_STORAGE_KEY));

    act(() => statement.result.current.setRatio(0.45));

    expect(statement.result.current.ratio).toBe(0.45);
    expect(shared.result.current.ratio).toBe(FALLBACK);
    expect(window.localStorage.getItem(IMPORT_SPLIT_RATIO_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(STATEMENT_SPLIT_RATIO_STORAGE_KEY)).toBe("0.45");
  });

  it("persists a drag", () => {
    const { result } = renderHook(() => useSplitRatio(FALLBACK));

    act(() => result.current.setRatio(0.42));

    expect(result.current.ratio).toBe(0.42);
    expect(window.localStorage.getItem(IMPORT_SPLIT_RATIO_STORAGE_KEY)).toBe("0.42");
  });

  it("survives a remount, which is what persistence is for", () => {
    const first = renderHook(() => useSplitRatio(FALLBACK));
    act(() => first.result.current.setRatio(0.42));
    first.unmount();

    // Leaving the wizard and coming back is exactly this: a fresh mount, with
    // no wizard state between the two.
    const { result } = renderHook(() => useSplitRatio(FALLBACK));
    expect(result.current.ratio).toBe(0.42);
  });

  it("clamps a drag past either end, and stores what it clamped to", () => {
    const { result } = renderHook(() => useSplitRatio(FALLBACK));

    act(() => result.current.setRatio(0.99));
    expect(result.current.ratio).toBe(MAX_SPLIT_RATIO);

    act(() => result.current.setRatio(-1));
    expect(result.current.ratio).toBe(MIN_SPLIT_RATIO);
    expect(window.localStorage.getItem(IMPORT_SPLIT_RATIO_STORAGE_KEY)).toBe(
      String(MIN_SPLIT_RATIO),
    );
  });

  it.each([
    ["unparseable", "not json"],
    ["the wrong type", '"0.35"'],
    ["a stale shape", '{"ratio":0.35}'],
    ["null", "null"],
    ["empty", ""],
    ["not a number", "NaN"],
    ["past the divider's own range", "0.95"],
    ["a pane with no width at all", "0"],
  ])("falls back to the step's default on %s", (_why, stored) => {
    window.localStorage.setItem(IMPORT_SPLIT_RATIO_STORAGE_KEY, stored);
    const { result } = renderHook(() => useSplitRatio(FALLBACK));
    expect(result.current.ratio).toBe(FALLBACK);
  });

  it("falls back when storage itself refuses to be read", () => {
    withStorage(
      {
        getItem: () => {
          throw new Error("SecurityError: storage is blocked");
        },
      },
      () => {
        const { result } = renderHook(() => useSplitRatio(FALLBACK));
        expect(result.current.ratio).toBe(FALLBACK);
      },
    );
  });

  it("keeps dragging when the write is refused", () => {
    withStorage(
      {
        setItem: () => {
          throw new Error("QuotaExceededError");
        },
      },
      () => {
        const { result } = renderHook(() => useSplitRatio(FALLBACK));
        // The position just doesn't survive a reload; this session still moves.
        expect(() => act(() => result.current.setRatio(0.42))).not.toThrow();
        expect(result.current.ratio).toBe(0.42);
      },
    );
  });

  it("reads storage once, on mount", () => {
    let reads = 0;
    withStorage(
      {
        getItem: () => {
          reads += 1;
          return "0.35";
        },
      },
      () => {
        const { rerender, result } = renderHook(() => useSplitRatio(FALLBACK));
        const afterMount = reads;
        rerender();
        act(() => result.current.setRatio(0.42));

        // Storage seeds the state and is never read again: a read per render
        // would race the hook's own writes and could jump the divider out from
        // under a drag in progress.
        expect(afterMount).toBe(1);
        expect(reads).toBe(1);
        expect(result.current.ratio).toBe(0.42);
      },
    );
  });
});

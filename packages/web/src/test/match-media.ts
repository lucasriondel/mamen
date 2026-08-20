/**
 * The two things the app asks the OS and the viewport for, under a runner that
 * evaluates no media queries.
 *
 * jsdom ships no `matchMedia`, and `next-themes` calls it the moment its
 * provider mounts. Until issue #143 the answer never mattered — the app pinned
 * itself to a scheme and `enableSystem` was false — so `test/setup.ts` stubbed a
 * constant "no". It matters now: with nothing stored, the OS *is* the choice, so
 * a test about that state has to be able to state what the OS says. Since issue
 * #154 a *width* query matters the same way — the transactions detail panel only
 * exists where there is room beside the table — so the stub answers `min-width`
 * from a settable viewport too.
 *
 * Everything else answers `false`, which is what the old constant stub did for
 * every query. Listeners are accepted and never fired: nothing here changes the
 * OS preference or resizes the window mid-test, and a stub that could would
 * invite a test that depends on a listener's wiring rather than on the app's.
 */

let prefersDark = false;

/** How wide the viewport claims to be, in px. `0` — no room for anything. */
let viewportWidth = 0;

/**
 * Set what the OS reports for the rest of the current test. Call it in a
 * `beforeEach`, or right before the render that reads it — `next-themes` asks
 * once, while its provider mounts.
 */
export function setPrefersDark(value: boolean): void {
  prefersDark = value;
}

/**
 * Set the viewport width every `(min-width: …)` query is answered against, for
 * the rest of the current test. The default is `0`, so a test that says nothing
 * gets the narrow layout — the one that must work everywhere.
 */
export function setViewportWidth(px: number): void {
  viewportWidth = px;
}

/** `(min-width: 1280px)` / `(min-width: 80rem)` → the px bound it names. */
function minWidthBound(query: string): number | undefined {
  const match = /min-width:\s*([\d.]+)(px|rem)/.exec(query);
  if (match == null) return undefined;
  const value = Number(match[1]);
  // The root font size jsdom reports; `rem` bounds are authored against it.
  return match[2] === "rem" ? value * 16 : value;
}

/** Install the stub. `test/setup.ts` calls this once per test file. */
export function installMatchMedia(): void {
  if (typeof window === "undefined") return;

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string): MediaQueryList =>
      ({
        media: query,
        // A getter, not a value: `next-themes` holds the list it made at
        // mount and re-reads `.matches` from it.
        get matches() {
          const bound = minWidthBound(query);
          if (bound != null) return viewportWidth >= bound;
          return /prefers-color-scheme:\s*dark/.test(query) && prefersDark;
        },
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  });
}

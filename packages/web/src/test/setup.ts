import "@testing-library/jest-dom";
import { installMatchMedia } from "./match-media";

// jsdom ships neither `ResizeObserver` nor `Element.scrollIntoView`, both of
// which cmdk touches while measuring and keeping the active item in view (PRD
// "Seam 2" testing note). Stub them globally so any component test that renders
// the Command palette (the issuer assignment picker) runs under jsdom.
if (!("ResizeObserver" in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// Guarded on the DOM's existence, not just the member's: setup files run for
// every test file, and a few here declare `@vitest-environment node` because
// what they import refuses to load under jsdom (esbuild, via `vite.config.ts`).
// There is nothing to patch in those.
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// Under this runner `window.localStorage` exists but is a bare object with none
// of the Storage methods, so anything persisting a preference (the transactions
// column-visibility toggle) blows up on `setItem`. Install a minimal in-memory
// Storage so those tests exercise real read/write round-trips.
if (typeof window !== "undefined" && typeof window.localStorage?.setItem !== "function") {
  const store = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, String(value));
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => store.clear(),
      key: (index: number) => [...store.keys()][index] ?? null,
      get length() {
        return store.size;
      },
    },
  });
}

// jsdom implements neither `URL.createObjectURL` nor `revokeObjectURL`, which the
// PDF side-by-side validation view uses to render the source PDF in a blob-URL
// iframe. Stub them so those component tests run under jsdom.
if (!("createObjectURL" in URL)) {
  URL.createObjectURL = () => "blob:mamen-test";
}
if (!("revokeObjectURL" in URL)) {
  URL.revokeObjectURL = () => {};
}

// jsdom evaluates no media queries and ships no `matchMedia`, which `next-themes`
// calls the moment its provider mounts — and, since issue #154, so does anything
// that only exists at a given width. The stub answers both from settable state
// rather than a constant "no" — see `test/match-media.ts`. It is installed
// unconditionally: a test that states the OS preference must not be at the mercy
// of whatever a future jsdom decides `matchMedia` returns by default.
installMatchMedia();

// jsdom performs no layout, so every element measures 0×0 and recharts'
// `ResponsiveContainer` — which sizes itself from its parent — warns on every
// render that its chart has no width or height. The recap's charts are
// therefore unassertable under jsdom (their pure data shaping is tested
// directly instead, in `features/recap/charts/*.test.ts`), and the warning is
// noise that buries real failures in the output.
//
// Given a `ResizeObserver` that reports a real box, recharts sizes itself and
// stays quiet — so the stub above answers with one rather than silencing the
// console, which would hide genuine errors too.
if (typeof globalThis.ResizeObserver !== "undefined") {
  const CHART_BOX = {
    width: 640,
    height: 320,
    top: 0,
    left: 0,
    bottom: 320,
    right: 640,
    x: 0,
    y: 0,
  };
  globalThis.ResizeObserver = class {
    constructor(private readonly callback: ResizeObserverCallback) {}
    observe(target: Element) {
      this.callback(
        [{ target, contentRect: CHART_BOX } as unknown as ResizeObserverEntry],
        this as unknown as ResizeObserver,
      );
    }
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;

  // `ResponsiveContainer` also reads the DOM box directly on its first paint,
  // before any observer fires.
  if (typeof Element !== "undefined") {
    Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
      return { ...CHART_BOX, toJSON: () => CHART_BOX } as DOMRect;
    };
  }
}

import "@testing-library/jest-dom";
import { installMatchMedia } from "./prefers-color-scheme";

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
// calls the moment its provider mounts. Since issue #143 the answer decides the
// scheme whenever nothing is stored, so the stub is settable rather than a
// constant "no" — see `test/prefers-color-scheme.ts`. It is installed
// unconditionally: a test that states the OS preference must not be at the mercy
// of whatever a future jsdom decides `matchMedia` returns by default.
installMatchMedia();

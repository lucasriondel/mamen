import "@testing-library/jest-dom";

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

if (!Element.prototype.scrollIntoView) {
	Element.prototype.scrollIntoView = () => {};
}

// Under this runner `window.localStorage` exists but is a bare object with none
// of the Storage methods, so anything persisting a preference (the transactions
// column-visibility toggle) blows up on `setItem`. Install a minimal in-memory
// Storage so those tests exercise real read/write round-trips.
if (typeof window.localStorage?.setItem !== "function") {
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

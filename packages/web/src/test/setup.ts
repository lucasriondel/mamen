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

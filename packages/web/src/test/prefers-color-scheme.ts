/**
 * The OS colour-scheme preference, under a runner that evaluates no media
 * queries.
 *
 * jsdom ships no `matchMedia`, and `next-themes` calls it the moment its
 * provider mounts. Until issue #143 the answer never mattered — the app pinned
 * itself to a scheme and `enableSystem` was false — so `test/setup.ts` stubbed a
 * constant "no". It matters now: with nothing stored, the OS *is* the choice, so
 * a test about that state has to be able to state what the OS says.
 *
 * The stub answers `(prefers-color-scheme: dark)` from the flag below and every
 * other query with `false`, which is what the old constant stub did for all of
 * them. Listeners are accepted and never fired: nothing here changes the OS
 * preference mid-test, and a stub that could would invite a test that depends on
 * `next-themes`' listener wiring rather than on the app's.
 */

let prefersDark = false;

/**
 * Set what the OS reports for the rest of the current test. Call it in a
 * `beforeEach`, or right before the render that reads it — `next-themes` asks
 * once, while its provider mounts.
 */
export function setPrefersDark(value: boolean): void {
	prefersDark = value;
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

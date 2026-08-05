import { describe, expect, it } from "vitest";

/**
 * The source of every **bundle UI** module (issue #82). Both conventions below
 * are invisible at runtime — an `interface` and a `type` describe the same
 * object, and a co-located subcomponent renders exactly like an imported one —
 * so nothing else in the suite can notice them slipping. They are read off the
 * source instead, the way {@link ../skeletons.test.tsx} reads its `key`
 * expressions.
 *
 * Scoped to the bundle feature rather than the whole app: this is the surface
 * the conventions were applied to, and widening the glob would fail on files
 * written before them, which is a different piece of work.
 */
const SOURCES = Object.fromEntries(
	Object.entries(
		import.meta.glob("./bundle-*.{ts,tsx}", {
			query: "?raw",
			import: "default",
			eager: true,
		}) as Record<string, string>,
	).filter(([path]) => !path.includes(".test.")),
);

/** `function Foo(` — a React component, as this codebase declares them. */
const COMPONENT_DECLARATION = /\bfunction\s+([A-Z]\w*)\s*\(/g;

const INTERFACE_DECLARATION = /\binterface\s+\w+/;

describe("bundle UI conventions (issue #82)", () => {
	it("covers every bundle module", () => {
		expect(Object.keys(SOURCES).sort()).toEqual([
			"./bundle-action-bar.tsx",
			"./bundle-date-form.tsx",
			"./bundle-dissolve-block.tsx",
			"./bundle-member-actions.tsx",
			"./bundle-membership-section.tsx",
			"./bundle-section.tsx",
		]);
	});

	// The codebase declares object shapes as type aliases.
	it.each(
		Object.entries(SOURCES),
	)("%s declares its shapes as type aliases", (_path, source) => {
		expect(source).not.toMatch(INTERFACE_DECLARATION);
	});

	// One React component per file: a subcomponent that grows inside its parent's
	// module is the shape this issue was opened to undo.
	it.each(
		Object.entries(SOURCES),
	)("%s declares one component", (_path, source) => {
		const components = [...source.matchAll(COMPONENT_DECLARATION)].map(
			(match) => match[1],
		);

		expect(components).toHaveLength(1);
	});
});

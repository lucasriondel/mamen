/**
 * A one-shot handoff for a statement dropped on the accounts import grid.
 *
 * The grid's month cells are dropzones, but a dropped `File` can't ride in a URL
 * search param, so the cell parses the CSV up front and stashes the result here
 * before navigating to `/import`. The wizard drains it once on mount and clears
 * it, so a later manual visit to `/import` starts clean. Deliberately a module
 * singleton, not React state: it must survive the route change that unmounts the
 * grid and mounts the wizard.
 */

/** A parsed statement waiting to be picked up by the import wizard. */
export type ParsedHandoff = {
	fileName: string;
	headers: readonly string[];
	rows: ReadonlyArray<Record<string, string>>;
};

let pending: ParsedHandoff | null = null;

/** Stash a parsed statement for the wizard to pick up after navigation. */
export function stashHandoff(handoff: ParsedHandoff): void {
	pending = handoff;
}

/** Take the pending statement (if any), clearing it so it's consumed only once. */
export function takeHandoff(): ParsedHandoff | null {
	const handoff = pending;
	pending = null;
	return handoff;
}

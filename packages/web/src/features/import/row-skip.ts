/**
 * What a **skipped row** looks like, said once for every table that draws one.
 *
 * The shell of each preview only marks the row `data-skipped` — what striking
 * *means* differs between them (the editable panel also fades and disables its
 * inputs) — so the cells ask for the strike, and they ask here rather than
 * spelling the class out per column.
 *
 * Its own module because the file pane draws it too (issue #215): a line of the
 * statement whose record the user held out is struck on the left exactly as its
 * record is on the right, and the two panes saying the same thing about the same
 * row must not be two spellings that can drift. The file pane is a plain table
 * of strings and has no business importing the TanStack primitives to learn what
 * a strike is.
 */
export function strikeWhileSkipped(isSkipped: boolean): string {
  return isSkipped ? "line-through" : "";
}

import { cn } from "@/lib/utils";

/**
 * The pill a correctable cell wears — on the **file pane**'s transcribed cells
 * (issue #220) and on the **side-by-side validation** view's extracted rows
 * (issue #193) alike.
 *
 * Both spelled the same rounded token-bordered field out separately, and both are
 * the same thing on screen: a value the user may be wrong about, offered for
 * correction. One definition so a corrected cell cannot come to look like one
 * kind of input on one path and another kind on the other.
 *
 * `struck` is what a **skipped row** does to it: struck through and faded, the
 * visual half of the disabling that keeps an edit to a row that will not commit
 * from being an edit thrown away. The file pane passes it for a line whose
 * *record* the user held out (issue #215) — the skip is drawn on both halves of
 * the split — but leaves the cell editable there, since correcting a
 * transcription is what un-skipping a row is usually for.
 */
export function editableCellClass({
  struck = false,
  className,
}: { struck?: boolean; className?: string } = {}): string {
  return cn(
    "w-full rounded-full border border-gousse-line bg-gousse-bg px-3 py-1 text-gousse-ink",
    struck && "line-through opacity-60",
    className,
  );
}

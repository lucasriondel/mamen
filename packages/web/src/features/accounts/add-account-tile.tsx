import { Plus } from "lucide-react";
import { useState } from "react";
import { AddAccountDialog } from "./add-account-dialog";

/**
 * The last item of the accounts list: a dashed ghost tile that opens the
 * create-account dialog (issue #131).
 *
 * The form used to be pinned above the list, permanently open and the most
 * prominent thing on the page — the loudest position for the rarest task, and
 * two fields of empty chrome between the title and the accounts the page is
 * about. As a tile it sits where the gesture makes sense ("…and one more"),
 * costs one row of dashes at rest, and asks its two questions only once pressed.
 *
 * An `<li>` because it is the last item of the same `<ul>`: a button parked
 * outside the list would be one more thing for the list's own layout to agree
 * with, and the tile is genuinely part of the sequence it ends.
 *
 * It is also the page's **empty state** — with no accounts there is nothing to
 * list and exactly one thing to do — which is the whole of why the label is a
 * prop: "add *another*" names a second account a first-time user hasn't got.
 */
export function AddAccountTile({
  label = "Add another account",
}: {
  /** What the tile says. The view names a first account when the list is empty. */
  label?: string;
} = {}) {
  const [open, setOpen] = useState(false);

  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border border-gousse-line border-dashed p-4 text-gousse-muted text-sm outline-none transition-colors hover:border-gousse-accent hover:text-gousse-accent focus-visible:ring-2 focus-visible:ring-gousse-accent"
      >
        <Plus className="size-4" aria-hidden />
        {label}
      </button>

      {/* Keyed on each opening so the draft starts empty every time: a name the
          user cancelled out of is one they walked away from. */}
      {open ? <AddAccountDialog open onOpenChange={setOpen} key={String(open)} /> : null}
    </li>
  );
}

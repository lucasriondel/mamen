import type { StatementFormat } from "@mamen/shared/contract";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface StatementFormatDeleteDialogProps {
  /** The format awaiting confirmation, or `null` when nothing is pending. */
  format: StatementFormat | null;
  /** A delete is in flight. */
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Confirmation for deleting one format, in the shape
 * {@link IssuerDeleteButton} established: named title, a description saying
 * plainly what is lost, ghost Cancel beside a danger confirm.
 *
 * There is a confirmation at all — where deleting an account or a category has
 * none — because the guard those two lean on does not exist here. Both of those
 * are refused by the API while anything still depends on them, and the refusal
 * says more than "are you sure?" could. Nothing depends on a format: the
 * transactions imported under it are already parsed and keep no reference back,
 * so the API will always say yes, and this dialog is the whole of the guard.
 *
 * The description says what a delete does *not* touch as well as what it does.
 * "Delete the thing that read my statements" sounds like it should take the
 * statements with it, and it does not — the fear is worth answering before the
 * click rather than after.
 */
export function StatementFormatDeleteDialog({
  format,
  busy,
  onConfirm,
  onCancel,
}: StatementFormatDeleteDialogProps) {
  return (
    <Dialog open={format !== null} onOpenChange={(open) => (open ? undefined : onCancel())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {format?.name}?</DialogTitle>
          <DialogDescription>
            This can't be undone. Transactions already imported with it stay exactly as they are —
            what goes is the saved way of reading this bank's files, so the next one has to be
            mapped again.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={busy}>
            Delete format
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

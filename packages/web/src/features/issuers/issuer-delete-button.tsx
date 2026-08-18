import { Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface IssuerDeleteButtonProps {
  /** Named in the confirmation, so the dialog says *which* issuer goes. */
  issuerName: string;
  /** Transactions still point here, so deleting would orphan them. */
  deleteBlocked: boolean;
  /** How many — the sentence beside a blocked Delete names the number. */
  transactionCount: number;
  onConfirm: () => void;
  busy?: boolean;
}

/**
 * **Delete issuer**, as a button on the page with a confirmation step.
 *
 * It used to be the last item of the avatar's menu, under a "Danger zone" label
 * — which put the one irreversible action on the page behind the control for
 * changing a picture, two clicks deep and discoverable only by opening a menu
 * whose trigger reads "Issuer image". A destructive action should be visible at
 * rest and confirmed before it runs, not hidden and instant, so the menu keeps
 * the image actions and deletion moves out here in front of a dialog.
 *
 * The button stays *rendered* while blocked so the reason has somewhere to live
 * — the API would refuse the write anyway, but a disabled control with a
 * sentence beside it answers "why not" where a hidden one raises it.
 */
export function IssuerDeleteButton({
  issuerName,
  deleteBlocked,
  transactionCount,
  onConfirm,
  busy = false,
}: IssuerDeleteButtonProps) {
  const [open, setOpen] = useState(false);

  const confirm = () => {
    setOpen(false);
    onConfirm();
  };

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <Button
        variant="ghost"
        size="sm"
        disabled={deleteBlocked || busy}
        onClick={() => setOpen(true)}
        className="text-gousse-high hover:bg-gousse-high/10 hover:text-gousse-high"
      >
        <Trash2 className="size-3.5" aria-hidden />
        Delete issuer
      </Button>

      {deleteBlocked ? (
        <p className="text-gousse-muted text-xs tabular-nums">
          {transactionCount} transaction{transactionCount === 1 ? "" : "s"} reference this issuer —
          reassign them to delete.
        </p>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {issuerName}?</DialogTitle>
            <DialogDescription>
              This can't be undone — the issuer, its image, its note and its matching rules are gone
              for good.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirm} disabled={busy}>
              Delete issuer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

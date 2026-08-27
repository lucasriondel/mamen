import type { AccountId } from "@mamen/shared/contract";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatementFormatsList } from "./statement-formats-list";

export interface StatementFormatsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: AccountId;
  accountName: string;
}

/**
 * **Statement formats** for one account, as a dialog over the accounts page.
 *
 * A dialog rather than a details route, and that is a deliberate answer to the
 * obvious alternative. There is no per-account details surface in this app: the
 * card holds everything an account has, and both {@link AccountCard} and
 * {@link AccountsView} record that a two-region layout was merged into it on
 * purpose. Formats are not a reason to unpick that — they are read rarely, when
 * something needs cleaning up, and a rare visit is what a dialog is for.
 *
 * It is opened from the card's `···` menu, beside Edit and Delete, because
 * that menu is already where an account's occasional actions live.
 *
 * The list is mounted only while the dialog is open, so its read is not spent by
 * every card on the page — a page of ten accounts would otherwise make ten
 * format requests to render ten menus nobody opened.
 */
export function StatementFormatsDialog({
  open,
  onOpenChange,
  accountId,
  accountName,
}: StatementFormatsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Statement formats</DialogTitle>
          <DialogDescription>
            How {accountName}'s files get read. One is saved each time you map an import.
          </DialogDescription>
        </DialogHeader>

        {open ? <StatementFormatsList accountId={accountId} accountName={accountName} /> : null}
      </DialogContent>
    </Dialog>
  );
}

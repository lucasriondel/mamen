import { EllipsisVertical, Pencil, Trash2 } from "lucide-react";
import {
  Menu,
  MenuContent,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";

export interface StatementFormatActionsMenuProps {
  /** The format these actions belong to — names every item. */
  name: string;
  onRename: () => void;
  onDelete: () => void;
  /** A delete is in flight — the item stays rendered but won't fire twice. */
  deleting: boolean;
}

/**
 * A format row's two actions, one `···` away — the same shape the account card
 * and the categories tree use, because this is the same situation: exactly two
 * actions, one of them destructive, on a row whose resting state should be the
 * data.
 *
 * The first item is *Rename*, not *Edit*: unlike the account card's form, this
 * one reveals a single field and that field is the name, so naming it costs
 * nothing and saying "Edit" would promise the mapping is editable when it is not.
 *
 * Nothing blocks the delete. The account card's equivalent is disabled while
 * transactions exist, because deleting a busy account orphans its rows; a format
 * has no such dependents — the transactions imported under it are already parsed
 * and hold no reference back — so there is no state in which deleting one is
 * refused, and the confirmation dialog is the whole of the guard.
 */
export function StatementFormatActionsMenu({
  name,
  onRename,
  onDelete,
  deleting,
}: StatementFormatActionsMenuProps) {
  return (
    <Menu>
      <MenuTrigger
        render={
          <button
            type="button"
            aria-label={`More actions for ${name}`}
            title={`More actions for ${name}`}
            className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-gousse-muted outline-none transition-colors hover:bg-gousse-line/60 hover:text-gousse-ink focus-visible:ring-2 focus-visible:ring-gousse-accent data-[popup-open]:bg-gousse-line/60 data-[popup-open]:text-gousse-ink"
          >
            <EllipsisVertical className="size-4" aria-hidden />
          </button>
        }
      />
      <MenuContent>
        <MenuGroup>
          <MenuItem onClick={onRename}>
            <Pencil className="size-3.5 text-gousse-muted" aria-hidden />
            Rename {name}
          </MenuItem>
        </MenuGroup>

        <MenuSeparator />

        <MenuGroup>
          <MenuGroupLabel>Danger zone</MenuGroupLabel>
          <MenuItem danger disabled={deleting} onClick={onDelete}>
            <Trash2 className="size-3.5" aria-hidden />
            Delete {name}
          </MenuItem>
        </MenuGroup>
      </MenuContent>
    </Menu>
  );
}

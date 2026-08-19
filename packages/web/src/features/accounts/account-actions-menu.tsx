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

export interface AccountActionsMenuProps {
  /** The account these actions belong to — names every item. */
  name: string;
  onEdit: () => void;
  onDelete: () => void;
  /** The account still has transactions, so deleting it would orphan them. */
  blocked: boolean;
  /** A delete is in flight — the item stays rendered but won't fire twice. */
  deleting: boolean;
}

/**
 * A card's occasional actions, one `···` away (issue #131).
 *
 * They used to be two `secondary` buttons the width of the row, which gave
 * *Delete* — disabled in the common case, and destructive in the other — the
 * same weight as the account's own name. Behind a menu the destructive item can
 * sit last, tinted, behind a separator, and the card's resting state is the data.
 *
 * The first item is *Edit*, not *Rename*: the form it opens carries the name and
 * the IBAN, and a menu item that names one of the two fields it reveals sends
 * anyone looking for the other one somewhere else.
 *
 * The delete guard is client-side by necessity: the API's `remove` does not
 * check for referencing transactions (see the accounts repository), so deleting
 * a busy account would orphan its rows. `blocked` disables the item and puts the
 * reason *under it* rather than on the card — that sentence is an answer to
 * pressing Delete, and the resting card already states the count as a stat.
 *
 * Every item is named for its account (`Delete Everyday`), as the categories
 * tree names its nodes: several of these render per page, so "Delete" alone
 * names none of them.
 */
export function AccountActionsMenu({
  name,
  onEdit,
  onDelete,
  blocked,
  deleting,
}: AccountActionsMenuProps) {
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
          <MenuItem onClick={onEdit}>
            <Pencil className="size-3.5 text-gousse-muted" aria-hidden />
            Edit {name}
          </MenuItem>
        </MenuGroup>

        <MenuSeparator />

        <MenuGroup>
          <MenuGroupLabel>Danger zone</MenuGroupLabel>
          <MenuItem
            danger
            disabled={blocked || deleting}
            onClick={onDelete}
            // Base UI closes the menu on select; a refused delete would close it
            // on the reason it just showed. Disabled items don't fire anyway —
            // this is the belt to that brace.
            closeOnClick={!blocked}
          >
            <Trash2 className="size-3.5" aria-hidden />
            Delete {name}
          </MenuItem>
          {blocked ? (
            <p className="px-2.5 pt-0.5 pb-1 text-gousse-muted text-xs">
              This account still has transactions — move or clear them first.
            </p>
          ) : null}
        </MenuGroup>
      </MenuContent>
    </Menu>
  );
}

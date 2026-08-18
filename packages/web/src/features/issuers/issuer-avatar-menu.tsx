import type { Issuer } from "@mamen/shared/contract";
import { ChevronDown, ImageOff, Search, Trash2, Upload } from "lucide-react";
import {
  Menu,
  MenuContent,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import { IssuerAvatar } from "./issuer-avatar";

export interface IssuerAvatarMenuProps {
  issuer: Issuer;
  /** Open the file picker — the upload path. */
  onUpload: () => void;
  /** Open the logo search — the other path to the same bytes (ADR 0007). */
  onSearchLogo: () => void;
  onRemoveImage: () => void;
  onDelete: () => void;
  /** Transactions still point here, so deleting would orphan them. */
  deleteBlocked: boolean;
  /** How many — the sentence under a blocked Delete names the number. */
  transactionCount: number;
  busy?: boolean;
}

/**
 * The issuer's **avatar as a menu trigger** — every action that acts on the
 * issuer *as an object* (its picture, and its existence) behind one control.
 *
 * The three image buttons used to sit in a row under the header, which gave a
 * rarely-used control the width of the page and pushed the transactions — the
 * reason the page is open — below the fold. Hanging them off the avatar puts
 * them where the thing they change already is, and the resting header is the
 * issuer rather than a toolbar.
 *
 * Delete sits last, tinted, behind a separator, exactly as on an account card
 * ({@link AccountActionsMenu}): a mis-aimed click lands on a separator rather
 * than on the destructive item. It stays *rendered* while blocked so the reason
 * has somewhere to live — the API would refuse the write anyway, but a disabled
 * item with a sentence under it answers "why not" where a hidden one raises it.
 */
export function IssuerAvatarMenu({
  issuer,
  onUpload,
  onSearchLogo,
  onRemoveImage,
  onDelete,
  deleteBlocked,
  transactionCount,
  busy = false,
}: IssuerAvatarMenuProps) {
  const hasImage = issuer.imageUrl != null;

  return (
    <Menu>
      <MenuTrigger
        render={
          <button
            type="button"
            // Deliberately not named after the issuer: the name is already the
            // page's heading (and its rename field) right beside this, so
            // repeating it here gives one page two controls matching the same
            // name — ambiguous to a screen reader and to a `by role and name`
            // query alike. "Issuer image" names what the menu acts on.
            aria-label="Issuer image and actions"
            title="Issuer image and actions"
            className="group relative shrink-0 cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-gousse-accent"
          >
            <IssuerAvatar
              imageUrl={issuer.imageUrl}
              defaultCategoryId={issuer.defaultCategoryId}
              size="lg"
            />
            {/* The affordance: without it the avatar is just a picture, and
                nothing says the actions are under it. */}
            <span
              aria-hidden
              className="absolute -right-0.5 -bottom-0.5 flex size-5 items-center justify-center rounded-full border border-gousse-line bg-gousse-panel text-gousse-muted transition-colors group-hover:text-gousse-ink group-data-[popup-open]:text-gousse-ink"
            >
              <ChevronDown className="size-3" />
            </span>
          </button>
        }
      />
      <MenuContent align="start">
        <MenuGroup>
          <MenuGroupLabel>Image</MenuGroupLabel>
          <MenuItem onClick={onUpload} disabled={busy}>
            <Upload className="size-3.5 text-gousse-muted" aria-hidden />
            Upload image…
          </MenuItem>
          <MenuItem onClick={onSearchLogo} disabled={busy}>
            <Search className="size-3.5 text-gousse-muted" aria-hidden />
            Search logo…
          </MenuItem>
          <MenuItem onClick={onRemoveImage} disabled={!hasImage || busy}>
            <ImageOff className="size-3.5 text-gousse-muted" aria-hidden />
            Remove image
          </MenuItem>
        </MenuGroup>

        <MenuSeparator />

        <MenuGroup>
          <MenuGroupLabel>Danger zone</MenuGroupLabel>
          <MenuItem
            danger
            disabled={deleteBlocked || busy}
            onClick={onDelete}
            // Base UI closes on select; a refused delete would close the menu on
            // the reason it just showed. Disabled items don't fire anyway.
            closeOnClick={!deleteBlocked}
          >
            <Trash2 className="size-3.5" aria-hidden />
            Delete issuer
          </MenuItem>
          {deleteBlocked ? (
            <p className="px-2.5 pt-0.5 pb-1 text-gousse-muted text-xs tabular-nums">
              {transactionCount} transaction{transactionCount === 1 ? "" : "s"} reference this
              issuer — reassign them to delete.
            </p>
          ) : null}
        </MenuGroup>
      </MenuContent>
    </Menu>
  );
}

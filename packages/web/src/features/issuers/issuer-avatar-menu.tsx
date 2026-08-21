import type { Issuer } from "@mamen/shared/contract";
import { ChevronDown, ImageOff, Search, Upload } from "lucide-react";
import {
  Menu,
  MenuContent,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
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
  busy?: boolean;
}

/**
 * The issuer's **avatar as a menu trigger** — the three ways to change its
 * picture behind the picture itself.
 *
 * Those buttons used to sit in a row under the header, which gave a rarely-used
 * control the width of the page and pushed the transactions — the reason the
 * page is open — below the fold. Hanging them off the avatar puts them where the
 * thing they change already is, and the resting header is the issuer rather than
 * a toolbar.
 *
 * Deleting the issuer is **not** here: it lived as this menu's last item, which
 * filed the one irreversible action on the page behind a trigger labelled
 * "Issuer image". It is a button on the page now, in front of a confirmation —
 * see {@link IssuerDeleteButton}.
 */
export function IssuerAvatarMenu({
  issuer,
  onUpload,
  onSearchLogo,
  onRemoveImage,
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
      </MenuContent>
    </Menu>
  );
}

import type { Category } from "@mamen/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { CategoryIcon } from "@/components/category-icon";
import { categoryQueries } from "@/lib/sdk";
import { cn } from "@/lib/utils";
import { issuerAvatarFallback } from "./avatar-fallback";

/**
 * Size presets for {@link IssuerAvatar}: the chip, and the glyph that sits in it.
 * The glyph is a shade over half the chip so it reads as an icon in a circle
 * rather than a clipped one.
 */
const SIZES = {
  sm: { chip: "size-6", text: "text-xs", glyph: 14 },
  // Top-bar scale: big enough to read as the page's identity, small enough to
  // sit in the shell's h-14 bar beside the name.
  md: { chip: "size-8", text: "text-sm", glyph: 18 },
  lg: { chip: "size-12", text: "text-base", glyph: 26 },
} as const;

/**
 * How many categories to read for the fallback. Matches the limit every other
 * surface passes so the query key — and therefore the cache entry — is shared: a
 * grid of avatars costs one request between them, and none at all on a page that
 * has already loaded the tree.
 */
const CATEGORY_SCAN_LIMIT = 200;

export interface IssuerAvatarProps {
  /** Optional issuer image URL (root-relative `/uploads/issuers/…`). */
  imageUrl?: string;
  /** The **issuer default category** id — the chain's second rung. */
  defaultCategoryId?: number | null;
  /** Visual size: `sm` for table cells and pickers, `lg` for grid cards. */
  size?: keyof typeof SIZES;
  className?: string;
}

/**
 * A round issuer avatar, painting the **Avatar fallback chain** (ADR 0007,
 * issue #59): the issuer's image; else its **issuer default category**'s icon on
 * that category's **Resolved colour**; else a neutral grey `?`. The name's
 * initial, which used to be the middle rung, is gone — a wall of letters is not
 * scannable, where a wall of category-coloured glyphs is. `name` is not a prop
 * any more, so no call site can quietly reintroduce it.
 *
 * The chip is *filled* with the category colour and the glyph drawn in a
 * contrasting ink, rather than the glyph being stroked in the colour. The colour
 * groups an issuer with its folder siblings at a distance; filling also makes
 * legibility theme-independent, because both sides of the contrast pair are then
 * fixed colours (see {@link readableInk}) instead of one of them being a token
 * that moves between light and dark.
 *
 * The chain lives here whole, category read included, so six call sites cannot
 * each get the inheritance walk half-right (ADR 0003). That read is `enabled`
 * only on the rung that needs it: an issuer with an image, or with no category at
 * all, does no lookup — which is what keeps the grey state presentational rather
 * than the seeded *Uncategorised* category.
 */
export function IssuerAvatar({
  imageUrl,
  defaultCategoryId,
  size = "sm",
  className,
}: IssuerAvatarProps) {
  const { chip, text, glyph } = SIZES[size];
  const needsCategory = imageUrl == null && defaultCategoryId != null;

  const categoriesQuery = useQuery({
    ...categoryQueries.list({ limit: CATEGORY_SCAN_LIMIT }),
    enabled: needsCategory,
  });
  // A disabled query still serves whatever is already cached, so gate the read
  // on the same flag rather than on `data` — otherwise an issuer with an image
  // would resolve a fallback it will never paint.
  const categories = needsCategory
    ? ((categoriesQuery.data?.items ?? []) as readonly Category[])
    : [];

  const fallback = issuerAvatarFallback(categories, defaultCategoryId);
  // An issuer that *has* a category has not reached the end of the chain yet
  // while its tree is in flight. Collapsing that window into the grey `?` would
  // state "nothing is known here" and then contradict it a tick later — a grid
  // of imageless issuers popping from a wall of `?` to a wall of colour. Held
  // apart from "none" so the empty rung stays an answer rather than a default.
  const state = imageUrl
    ? "image"
    : fallback
      ? "category"
      : needsCategory && categoriesQuery.isPending
        ? "pending"
        : "none";

  return (
    <span
      data-testid="issuer-avatar"
      data-avatar={state}
      style={fallback ? { backgroundColor: fallback.color } : undefined}
      className={cn(
        // Subtle inset ring keeps a light logo/chip legible against a light
        // panel — pure black/white at low alpha so it never tints the edge
        // (make-interfaces-feel-better #11).
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full font-medium ring-1 ring-black/10 ring-inset dark:ring-white/10",
        // The neutral rung's own surface; a filled chip overrides it inline.
        !fallback && "bg-gousse-bg text-gousse-muted",
        chip,
        className,
      )}
    >
      {imageUrl ? (
        <img src={imageUrl} alt="" className="size-full object-cover" />
      ) : fallback ? (
        <CategoryIcon name={fallback.icon} color={fallback.ink} size={glyph} />
      ) : state === "none" ? (
        <span aria-hidden className={text}>
          ?
        </span>
      ) : null}
    </span>
  );
}

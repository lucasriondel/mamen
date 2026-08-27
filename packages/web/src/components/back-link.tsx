import { Link, useCanGoBack, useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export interface BackLinkProps {
  /**
   * Where to go when there is no history to pop — a direct load, a bookmark, or
   * a link opened in a new tab. Also the link's `href`, so the control still
   * middle-clicks and right-click-copies like the navigation it looks like.
   */
  to: string;
  /** The label beside the arrow, e.g. "Transactions". */
  children: React.ReactNode;
  className?: string;
}

/**
 * A "back" affordance that pops the history stack rather than navigating to a
 * fresh copy of the list it points at.
 *
 * The distinction matters for any paged/filtered list: `<Link to="/transactions">`
 * lands on page 1 with the filters cleared, so a user who drilled into a row from
 * page 7 loses their place. Going *back* restores the exact entry they came from
 * — page, filters, sort, and scroll position — because it is that entry.
 *
 * When there is nothing to pop (opened directly, or via a link from outside the
 * app) it falls back to a normal navigation to {@link BackLinkProps.to}, so the
 * control is never a dead end.
 */
export function BackLink({ to, children, className }: BackLinkProps) {
  const router = useRouter();
  const canGoBack = useCanGoBack();

  // No `self-start`: the link now sits in the top bar's centered flex row
  // (`TopBarStart`), where it aligns with the controls beside it.
  const classes = cn(
    "flex items-center gap-1 text-sm text-gousse-muted transition-colors hover:text-gousse-ink",
    className,
  );

  if (!canGoBack) {
    return (
      <Link to={to} className={classes}>
        <ArrowLeft size={16} aria-hidden />
        {children}
      </Link>
    );
  }

  return (
    // Rendered as an anchor with a real `href` so it keeps a link's semantics
    // and modifier-click behaviour; the plain-click path is intercepted to pop
    // history instead of pushing a new entry.
    <a
      href={to}
      className={classes}
      onClick={(event) => {
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }
        event.preventDefault();
        router.history.back();
      }}
    >
      <ArrowLeft size={16} aria-hidden />
      {children}
    </a>
  );
}

import { useCallback, useSyncExternalStore } from "react";

/**
 * Whether a CSS media query matches, as React state.
 *
 * Layout is CSS's job and stays there — this exists for the cases where the
 * *behaviour* differs too, not just the arrangement. The transactions detail
 * panel (issue #154) is the first: a row click opens the panel beside the table
 * where there is room for one, and navigates to the standalone page where there
 * is not. A `hidden`/`block` pair cannot express that, because the click handler
 * has to know which of the two it is doing.
 *
 * `useSyncExternalStore` rather than `useState` + an effect, so the first render
 * already has the answer: the alternative mounts the narrow layout on every
 * load and corrects it a paint later, which is a flash on wide screens and a
 * mounted-then-thrown-away subtree on both. The subscription keeps it right
 * across a resize or an orientation change.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      // Guarded for the server/prerender pass and for any runner that ships no
      // `matchMedia`: no listener to attach, and `getSnapshot` answers `false`.
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
        return () => {};
      }
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );

  const getSnapshot = useCallback(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return window.matchMedia(query).matches;
  }, [query]);

  // The server never has a viewport, so it renders the narrow layout — the one
  // that works everywhere — and hydration widens it if the client says so.
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

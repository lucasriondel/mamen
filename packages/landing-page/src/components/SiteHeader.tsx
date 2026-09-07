import { HERO } from "../content";
import { BrandMark } from "./BrandMark";

/**
 * The app icon and the product name, centred above the hero — the same pairing
 * the app's own sidebar opens with, and in the same accent.
 *
 * It is a `<p>` rather than a heading: the page's one `<h1>` is the hero's, and
 * a wordmark is a logo rather than a level of the document outline.
 *
 * It renders `HERO.name`, not `HERO.heading` — the mark names the product, the
 * headline under it says what the product is for.
 */
export function SiteHeader() {
  return (
    <header className="site-header">
      <p className="wordmark">
        <BrandMark className="wordmark-mark" />
        <span>{HERO.name}</span>
      </p>
    </header>
  );
}

import { ICONS, type IconName } from "../content";

/**
 * One Lucide glyph, drawn inline.
 *
 * Inline `<svg>` rather than an `<img>` or a CSS background, because it
 * fetches nothing by construction and inherits `currentColor` — so the glyph
 * is tinted by the rule that holds it instead of shipping a second copy per
 * colour scheme.
 *
 * Decorative: each glyph repeats the feature name written beside it, so it is
 * hidden from assistive technology rather than given a label nobody needs to
 * hear twice.
 */
export function FeatureIcon({ name }: { name: IconName }) {
  return (
    <svg
      className="feature-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {ICONS[name].map((shape) => (
        <path d={shape.d} key={shape.d} />
      ))}
    </svg>
  );
}

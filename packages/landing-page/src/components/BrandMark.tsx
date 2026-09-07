/**
 * The app icon, as the app's own sidebar draws it beside the product name.
 *
 * A real `<img>` at the file `public/` carries, which Vite copies into `dist`
 * verbatim — the same mechanism the screenshots use. It is a copy of the web
 * app's `icon-192x192.png` rather than a reach into that package: the landing
 * image is built from its own manifest and takes no dependency on `@mamen/web`
 * (issue #113).
 *
 * Decorative, because the product name is written beside it in text: a screen
 * reader that announced both would say "mamen" twice.
 */
export function BrandMark({ className }: { className: string }) {
  return <img className={className} src="/mamen-icon.png" alt="" aria-hidden="true" />;
}

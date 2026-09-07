import { LUCIDE_LICENSE } from "../content";

/**
 * The third-party notice the icon licence asks for: present and readable, but
 * set below everything else so it does not compete with the page's own words.
 */
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <p className="colophon">{LUCIDE_LICENSE}</p>
    </footer>
  );
}

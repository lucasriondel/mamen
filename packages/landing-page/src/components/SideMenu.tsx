import { NAV } from "../content";
import { BrandMark } from "./BrandMark";

/**
 * The page's section navigation, as a sticky rail beside the prose.
 *
 * Plain in-page anchors: the page is one prerendered document with no
 * JavaScript, so there is no scroll spy and no active-state tracking. The
 * browser's own `:target` handles the jump, and the stylesheet highlights the
 * section it lands on — the only "active" state a page like this can state
 * honestly.
 *
 * A list rather than a column of divs, because that is what it is: on a narrow
 * viewport it collapses into a row of pills that scrolls on its own rather
 * than widening the page.
 *
 * The app's mark sits above the entries, which is where the app's own sidebar
 * puts it. It is hidden on a narrow viewport, where the rail is a row of pills
 * and a logo in front of them would only push them sideways.
 */
export function SideMenu() {
  return (
    <nav className="side-menu" aria-label="Sections">
      <p className="side-menu-brand">
        <BrandMark className="side-menu-mark" />
      </p>
      <ul className="side-menu-list">
        {NAV.map((entry) => (
          <li key={entry.id}>
            <a className="side-menu-link" href={`#${entry.id}`}>
              {entry.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

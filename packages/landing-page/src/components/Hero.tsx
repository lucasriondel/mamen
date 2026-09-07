import { ACTIONS, HERO, screenshotFigures, SITE } from "../content";
import { GitHubIcon } from "./GitHubIcon";
import { HeroScreenshotCycle } from "./HeroScreenshotCycle";

/**
 * The app first, at the full width of the page, with the headline, the lead
 * and the points stacked under it.
 *
 * The screenshots are the one thing on the page that shows what mamen *is*,
 * so they are read before the words rather than beside them at half the size.
 * Every surface `src/content/screenshots.ts` lists is here, cross-fading in
 * the one frame — there is no section below repeating them
 * (`HeroScreenshotCycle`).
 *
 * The copy keeps a wrapper of its own so it stops at reading width instead of
 * stretching to the full track under the image.
 *
 * The `h1` is the headline — what mamen is for. The product's name is the
 * wordmark's, above the screenshot (`SiteHeader`).
 */
export function Hero() {
  return (
    <div className="hero">
      <HeroScreenshotCycle figures={screenshotFigures()} />

      <div className="hero-copy">
        <h1>{HERO.heading}</h1>

        <p className="lead">{HERO.lead}</p>

        <ul className="points">
          {HERO.points.map((point) => (
            <li key={point.term}>
              <strong>{point.term}</strong> {point.detail}
            </li>
          ))}
        </ul>

        <Actions />
      </div>
    </div>
  );
}

/**
 * The two places a reader can go, under the hero copy.
 *
 * Plain anchors, not the router's `Link`: every destination is outside this
 * router — the app under its own prefix, and GitHub — and a client-side
 * navigation has nothing to navigate to in a page that ships no JavaScript.
 */
function Actions() {
  return (
    <p className="actions">
      {ACTIONS.map((action) => (
        <a
          key={action.href}
          className={action.kind === "primary" ? "cta" : "secondary"}
          href={action.href}
        >
          {/* The mark belongs to the destination, not to the standing: the
              primary action is the repository, and it is the repository the
              glyph names. */}
          {action.href === SITE.repositoryUrl ? <GitHubIcon /> : null}
          {action.label}
        </a>
      ))}
    </p>
  );
}

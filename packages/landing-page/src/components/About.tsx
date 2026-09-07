import { ABOUT, sectionId } from "../content";
import { FeatureIcon } from "./FeatureIcon";

/**
 * What mamen is, as a list of what it does.
 *
 * A description list rather than a grid of divs: every entry is a name and the
 * explanation of that name, which is what `<dl>` means — so a screen reader
 * announces the pairing, and with CSS off the page still reads as a list of
 * features rather than sixteen loose paragraphs. The rows are laid out by the
 * stylesheet on top of that, not instead of it.
 *
 * Ruled rows rather than cards, which is what makes the list indifferent to
 * how many features there are: a ninth is another row, where a two-column grid
 * would leave the ninth alone on a row of its own and stretch every short entry
 * to the height of its tallest neighbour.
 *
 * The glyph is a sibling of the pair rather than a child of the `<dt>`, because
 * it is the row's first column: nested inside the name it could not line up
 * with the description below it on a narrow screen.
 */
export function About() {
  return (
    <section className="about" id={sectionId("about")}>
      <h2>{ABOUT.heading}</h2>

      <p className="section-lead">{ABOUT.lead}</p>

      <dl className="feature-list">
        {ABOUT.features.map((feature) => (
          <div className="feature" key={feature.name}>
            <FeatureIcon name={feature.icon} />
            <dt>{feature.name}</dt>
            <dd>{feature.body}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

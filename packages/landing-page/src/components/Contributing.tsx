import { CONTRIBUTING, sectionId } from "../content";

export function Contributing() {
  return (
    <section className="contributing" id={sectionId("contributing")}>
      <h2>{CONTRIBUTING.heading}</h2>

      {CONTRIBUTING.body.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}

      <p>
        <a href={CONTRIBUTING.link.href}>{CONTRIBUTING.link.label}</a>
      </p>
    </section>
  );
}

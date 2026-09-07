import { INSTALL, prerequisiteLabel, sectionId } from "../content";

/**
 * How a reader runs mamen themselves — the only call to action the page can
 * honestly make, since there is nothing to sign up for.
 *
 * The steps are the section's spine, so they are given the room to read as
 * instructions rather than as a feature list: each is numbered in the gutter,
 * with the block a reader types under it.
 */
export function Install() {
  return (
    <section className="install" id={sectionId("install")}>
      <h2>{INSTALL.heading}</h2>

      <p className="section-lead">{INSTALL.lead}</p>

      <ul className="prerequisites">
        {INSTALL.prerequisites.map((prerequisite) => (
          <li key={prerequisite.name}>
            <a href={prerequisite.url}>{prerequisiteLabel(prerequisite)}</a> {prerequisite.detail}
          </li>
        ))}
      </ul>

      <ol className="steps">
        {INSTALL.steps.map((step) => (
          <li className="step" key={step.title}>
            <h3>{step.title}</h3>
            <p>{step.detail}</p>
            {/* The commands as one block, newlines and all: `<pre>` is what
                makes them copyable in the shape they are typed, and React
                escapes the angle brackets the key placeholder carries. */}
            <pre>
              <code>{step.commands.join("\n")}</code>
            </pre>
          </li>
        ))}
      </ol>

      <ul className="servers">
        {INSTALL.servers.map((server) => (
          <li key={server.name}>
            {/* Both addresses, because the reader may or may not have portless:
                the name it is fronted at, and the port it binds without it. */}
            <strong>{server.name}</strong> <code>{server.url}</code> <code>{server.directUrl}</code>{" "}
            {server.serves}
          </li>
        ))}
      </ul>

      <ul className="environment">
        {INSTALL.environment.map((variable) => (
          <li key={variable.variable}>
            <code>{variable.variable}</code> {variable.detail}
          </li>
        ))}
      </ul>
    </section>
  );
}

import {
  type Action,
  ACTIONS,
  CONTRIBUTING,
  type DevServer,
  type EnvironmentVariable,
  HERO,
  INSTALL,
  type InstallStep,
  type Point,
  type Prerequisite,
  prerequisiteLabel,
  SITE,
} from "./content";

/**
 * The public page served at the site root.
 *
 * It is a **string**, not a component: `src/prerender.ts` calls this at build
 * time and the result is what lands in `dist/index.html`, so nginx serves a
 * finished document and the browser runs no JavaScript to read it. That is the
 * whole shape of this package — no framework, no runtime, no hydration.
 *
 * The words come from `src/content/` rather than from this file (issue #147):
 * issue #145's expand step stands a second renderer (`src/preview/`) beside
 * this one, drawing the same page in React, and two copies of the copy would
 * drift inside a single commit. This module decides markup and nothing else —
 * every sentence, command, URL and label below is read, never written.
 *
 * Building the document by concatenation means **escaping is this renderer's
 * job**, where React's would do it for free. The install guide is what makes
 * that load-bearing rather than theoretical: a step's commands carry angle
 * brackets, and written through raw they would reach the browser as a tag it
 * silently swallows.
 *
 * The stylesheet is referenced at its source path. Vite rewrites URLs it finds
 * in the HTML entry — that is the one rewriting it does — so the built page
 * carries the hashed asset and the dev server serves the file directly.
 */

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#x27;",
};

/** Content, as text a browser will render rather than parse. */
const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ESCAPES[char] as string);

/** One thing worth knowing up front, as this page's list writes it. */
const point = ({ term, detail }: Point) =>
  `<li><strong>${escape(term)}</strong> ${escape(detail)}</li>`;

/** One prerequisite: what it is, and why it is needed. */
const prerequisite = (item: Prerequisite) =>
  `<li><a href="${escape(item.url)}">${escape(prerequisiteLabel(item))}</a> ${escape(item.detail)}</li>`;

/** One install step, with the block a reader copies out of it. */
const step = ({ title, detail, commands }: InstallStep) =>
  `<li>
					<h3>${escape(title)}</h3>
					<p>${escape(detail)}</p>
					<pre><code>${escape(commands.join("\n"))}</code></pre>
				</li>`;

/** One dev server `bun dev` brings up. */
const server = ({ name, url, serves }: DevServer) =>
  `<li><strong>${escape(name)}</strong> <code>${escape(url)}</code> ${escape(serves)}</li>`;

/** One variable an operator has to decide on. */
const variable = (item: EnvironmentVariable) =>
  `<li><code>${escape(item.variable)}</code> ${escape(item.detail)}</li>`;

/** One destination at the end of the page. */
const action = ({ label, href, kind }: Action) =>
  `<a class="${kind === "primary" ? "cta" : "secondary"}" href="${escape(href)}">${escape(label)}</a>`;

const paragraph = (line: string) => `<p>${escape(line)}</p>`;

/** The finished HTML document, as the build writes it. */
export function renderPage(): string {
  return `<!doctype html>
<html lang="en">
	<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0" />
		<meta name="color-scheme" content="dark light" />
		<meta name="theme-color" content="#0a0a0a" />
		<meta name="description" content="${escape(SITE.description)}" />
		<title>${escape(SITE.title)}</title>
		<link rel="stylesheet" href="/src/styles.css" />
	</head>
	<body>
		<main>
			<header class="hero">
				<h1>${escape(HERO.heading)}</h1>

				<p class="lead">${escape(HERO.lead)}</p>

				<ul class="points">
					${HERO.points.map(point).join("\n\t\t\t\t\t")}
				</ul>
			</header>

			<section class="install">
				<h2>${escape(INSTALL.heading)}</h2>

				<p class="section-lead">${escape(INSTALL.lead)}</p>

				<ul class="prerequisites">
					${INSTALL.prerequisites.map(prerequisite).join("\n\t\t\t\t\t")}
				</ul>

				<ol class="steps">
					${INSTALL.steps.map(step).join("\n\t\t\t\t\t")}
				</ol>

				<ul class="servers">
					${INSTALL.servers.map(server).join("\n\t\t\t\t\t")}
				</ul>

				<ul class="environment">
					${INSTALL.environment.map(variable).join("\n\t\t\t\t\t")}
				</ul>
			</section>

			<section class="contributing">
				<h2>${escape(CONTRIBUTING.heading)}</h2>

				${CONTRIBUTING.body.map(paragraph).join("\n\t\t\t\t")}

				<p><a href="${escape(CONTRIBUTING.link.href)}">${escape(CONTRIBUTING.link.label)}</a></p>
			</section>

			<p class="actions">
				${ACTIONS.map(action).join("\n\t\t\t\t")}
			</p>
		</main>
	</body>
</html>
`;
}

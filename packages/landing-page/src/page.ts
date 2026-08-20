import { APP_BASE_PATH_SLASH } from "@mamen/shared/app-base-path";
import {
  DESCRIPTION,
  HEADING,
  LEAD,
  OPEN_APP,
  type Point,
  POINTS,
  SOURCE,
  SOURCE_URL,
  TITLE,
} from "./copy";

/**
 * The public page served at the site root.
 *
 * It is a **string**, not a component: `src/prerender.ts` calls this at build
 * time and the result is what lands in `dist/index.html`, so nginx serves a
 * finished document and the browser runs no JavaScript to read it. That is the
 * whole shape of this package — no framework, no runtime, no hydration.
 *
 * The copy is deliberately thin (issue #113 scopes this slice to the package,
 * the build, the container and the routing; the real copy is a follow-up — the
 * colours caught up with the app's in #146). What it must not do is oversell:
 * mamen is one person's
 * self-hosted tool, there is nothing to sign up for, and a landing page that
 * implies otherwise is worse than none.
 *
 * The stylesheet is referenced at its source path. Vite rewrites URLs it finds
 * in the HTML entry — that is the one rewriting it does — so the built page
 * carries the hashed asset and the dev server serves the file directly.
 *
 * The words themselves come from `src/copy.ts` rather than from this file:
 * issue #145's expand step stands a second renderer (`src/preview/`) beside
 * this one, drawing the same page in React, and two copies of the copy would
 * drift inside a single commit.
 */

/** One selling point, as this page's list writes it. */
const point = ({ term, detail }: Point) =>
  `<li>\n\t\t\t\t\t<strong>${term}</strong> ${detail}\n\t\t\t\t</li>`;

/** The finished HTML document, as the build writes it. */
export function renderPage(): string {
  return `<!doctype html>
<html lang="en">
	<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0" />
		<meta name="color-scheme" content="light dark" />
		<meta name="theme-color" media="(prefers-color-scheme: light)" content="#f9f7f4" />
		<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0d0d0c" />
		<meta name="description" content="${DESCRIPTION}" />
		<title>${TITLE}</title>
		<link rel="stylesheet" href="/src/styles.css" />
	</head>
	<body>
		<main>
			<h1>${HEADING}</h1>

			<p class="lead">${LEAD}</p>

			<ul class="points">
				${POINTS.map(point).join("\n\t\t\t\t")}
			</ul>

			<p class="actions">
				<a class="cta" href="${APP_BASE_PATH_SLASH}">${OPEN_APP}</a>
				<a class="secondary" href="${SOURCE_URL}">${SOURCE}</a>
			</p>
		</main>
	</body>
</html>
`;
}

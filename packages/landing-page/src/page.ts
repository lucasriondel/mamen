import { APP_BASE_PATH_SLASH } from "@mamen/shared/app-base-path";

/**
 * The public page served at the site root.
 *
 * It is a **string**, not a component: `src/prerender.ts` calls this at build
 * time and the result is what lands in `dist/index.html`, so nginx serves a
 * finished document and the browser runs no JavaScript to read it. That is the
 * whole shape of this package — no framework, no runtime, no hydration.
 *
 * The copy is deliberately thin (issue #113 scopes this slice to the package,
 * the build, the container and the routing; the real copy and design are a
 * follow-up). What it must not do is oversell: mamen is one person's
 * self-hosted tool, there is nothing to sign up for, and a landing page that
 * implies otherwise is worse than none.
 *
 * The stylesheet is referenced at its source path. Vite rewrites URLs it finds
 * in the HTML entry — that is the one rewriting it does — so the built page
 * carries the hashed asset and the dev server serves the file directly.
 */

const TITLE = "mamen — personal finance for one person's accounts";

const DESCRIPTION =
	"mamen is a self-hosted, single-user personal-finance app. Import your bank " +
	"statements, curate the rows into issuers and categories, and read back " +
	"where the money went.";

/** The finished HTML document, as the build writes it. */
export function renderPage(): string {
	return `<!doctype html>
<html lang="en">
	<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0" />
		<meta name="color-scheme" content="dark light" />
		<meta name="theme-color" content="#0a0a0a" />
		<meta name="description" content="${DESCRIPTION}" />
		<title>${TITLE}</title>
		<link rel="stylesheet" href="/src/styles.css" />
	</head>
	<body>
		<main>
			<h1>mamen</h1>

			<p class="lead">
				A personal-finance app for one person's own accounts. Import bank
				statements, curate the raw rows into issuers and categories, and read
				back where the money went.
			</p>

			<ul class="points">
				<li>
					<strong>Self-hosted.</strong> The whole state is one SQLite file on a
					machine you control.
				</li>
				<li>
					<strong>Single-user.</strong> Built for its author's own bank exports
					— not a product, and nothing to join.
				</li>
				<li>
					<strong>Curated, not automatic.</strong> Matching rules assign
					issuers; categories come off the issuer unless you override the row.
				</li>
			</ul>

			<p class="actions">
				<a class="cta" href="${APP_BASE_PATH_SLASH}">Open the app</a>
				<a class="secondary" href="https://github.com/lucasriondel/mamen"
					>Source on GitHub</a
				>
			</p>
		</main>
	</body>
</html>
`;
}

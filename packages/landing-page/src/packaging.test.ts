import { existsSync, readdirSync, readFileSync } from "node:fs";
import { APP_BASE_PATH } from "@mamen/shared/app-base-path";
import { describe, expect, it } from "vitest";

/**
 * Two images, not one (issue #113).
 *
 * The landing site and the app are separate containers behind one reverse
 * proxy: the root goes to this package, `/app` (and `/api`, `/uploads`, which
 * the app's own nginx proxies) go to `@mamen/web`. That split is the point —
 * someone self-hosting mamen builds the app, not the owner's public site, so
 * the landing content must not ride along in the web image, and the app's
 * dependency tree must not ride along in this one.
 *
 * Nothing here runs Docker; the assertions are on the two Dockerfiles, the two
 * nginx configs and the two manifests, which is where the split is written
 * down. Paths are cwd-relative — vitest runs from the package root.
 */

const read = (path: string) => readFileSync(path, "utf8");

const dockerfile = read("Dockerfile");
const nginx = read("nginx.conf");
const webDockerfile = read("../web/Dockerfile");

const manifest = JSON.parse(read("package.json"));
const webManifest = JSON.parse(read("../web/package.json"));
const sharedManifest = JSON.parse(read("../shared/package.json"));

/** Every `COPY …` line in a Dockerfile, whitespace-collapsed. */
const copies = (text: string) =>
  [...text.matchAll(/^\s*COPY\s+(.+)$/gm)].map((m) => (m[1] as string).replace(/\s+/g, " ").trim());

/** Every `location <path>` an nginx config declares, modifiers kept. */
const locations = [...nginx.matchAll(/^\s*location\s+(.+?)\s*\{/gm)].map((m) => m[1] as string);

/**
 * The subpaths the landing page reaches `@mamen/shared` through: the
 * import-free deployment constants — the app's prefix, and the port registry's
 * rows (issue #137) — never the package root, which re-exports the contract and
 * pulls `effect` in behind it.
 */
const SHARED_SUBPATHS = ["@mamen/shared/app-base-path", "@mamen/shared/ports"] as const;

describe("the landing package's dependencies", () => {
  it("shares nothing with the app but the constant", () => {
    const app = new Set<string>(Object.keys(webManifest.dependencies));
    const shared = Object.keys(manifest.dependencies).filter((d) => app.has(d));
    // `@mamen/shared` is the exception, and a narrow one: the landing page
    // reads one string from it and the built site is HTML and CSS, so
    // nothing of it reaches the image. Every other name here would be a
    // framework the landing site does not run.
    expect(shared).toStrictEqual(["@mamen/shared"]);
    expect(manifest.dependencies["@mamen/sdk"]).toBeUndefined();
  });

  it("reaches its constants through the modules that import nothing", () => {
    for (const subpath of SHARED_SUBPATHS) {
      const target = sharedManifest.exports[subpath.replace("@mamen/shared", ".")];
      // The `.ts` extension is what makes the subpath loadable from
      // `vite.config.ts`, which Node resolves without extension guessing.
      expect(target).toMatch(/^\.\/src\/[\w-]+\.ts$/);
      // Import-free is what makes the subpath worth declaring: through the
      // package root, `effect` and `@effect/platform` enter this build.
      expect(read(`../shared/${target.slice(2)}`)).not.toMatch(/^\s*import\b/m);
    }

    // Every file in the package, not a list of the ones that import today:
    // the constants moved into `src/content/` with issue #147, and a guard
    // naming its readers by hand would have gone quiet the moment they did.
    const files = [
      "vite.config.ts",
      ...readdirSync("src", { recursive: true, encoding: "utf8" })
        .filter((entry) => /\.tsx?$/.test(entry))
        .map((entry) => `src/${entry}`),
    ];
    const specifiers = files.flatMap((file) =>
      [...read(file).matchAll(/from "(@mamen\/[^"]+)"/g)].map((m) => m[1]),
    );
    expect(specifiers).not.toStrictEqual([]);
    for (const specifier of specifiers) {
      expect(SHARED_SUBPATHS).toContain(specifier);
    }
  });
});

describe("the landing image", () => {
  it("needs no registry credential to build", () => {
    // The private GitHub Packages dependency went with issue #96, and this
    // package must never reintroduce the need for a token: a stranger
    // self-hosting mamen builds the app, but the landing image should build
    // for anyone, out of the public registry alone.
    expect(dockerfile).not.toMatch(/^\s*ARG\b/m);
    expect(dockerfile).not.toMatch(/--mount=type=secret/);
    expect(dockerfile).not.toMatch(/npmrc|_authToken|NPM_TOKEN|registry=/i);
    expect(existsSync(".npmrc")).toBe(false);
  });

  it("copies no application source", () => {
    // The workspace manifests are copied because `--frozen-lockfile`
    // resolves the whole workspace; nothing else of the app comes along.
    const foreign = copies(dockerfile).filter((line) => /packages\/(web|sdk|api)\b/.test(line));
    expect(foreign.length).toBeGreaterThan(0);
    for (const line of foreign) {
      expect(line).toMatch(/package\.json/);
    }
  });

  it("builds only this package", () => {
    expect(dockerfile).toMatch(/bun install .*--filter @mamen\/landing-page/);
    expect(dockerfile).toMatch(/bun run --filter @mamen\/landing-page build/);
  });

  it("serves the build at the root, not under the app's prefix", () => {
    expect(dockerfile).toMatch(
      /COPY --from=build \/app\/packages\/landing-page\/dist \/usr\/share\/nginx\/html\s*$/m,
    );
    expect(dockerfile).not.toMatch(new RegExp(`/usr/share/nginx/html${APP_BASE_PATH}\\b`));
  });

  it("carries its own nginx config, not the app's", () => {
    expect(dockerfile).toMatch(
      /COPY packages\/landing-page\/nginx\.conf \/etc\/nginx\/conf\.d\/default\.conf/,
    );
    expect(dockerfile).not.toMatch(/packages\/web\/nginx/);
  });
});

describe("the web image", () => {
  it("carries no landing content", () => {
    for (const line of copies(webDockerfile)) {
      expect(line).not.toMatch(/landing-page/);
    }
  });
});

describe("the landing nginx config", () => {
  it("serves the site root", () => {
    expect(locations).toContain("/");
    expect(nginx).toMatch(/root\s+\/usr\/share\/nginx\/html;/);
  });

  it("claims none of the paths the app's container owns", () => {
    // The reverse proxy routes the app's prefix and the API's paths to the
    // web container. A location for any of them here would be dead config
    // at best, and a second opinion about routing at worst.
    for (const location of locations) {
      expect(location.replace(/^=\s*/, "").startsWith(APP_BASE_PATH)).toBe(false);
      expect(location.startsWith("/api")).toBe(false);
      expect(location.startsWith("/uploads")).toBe(false);
    }
    expect(nginx).not.toMatch(/proxy_pass/);
  });

  it("does not fall back to the page: a missing path is a 404", () => {
    // The app is a single-page app and needs its shell served for unknown
    // paths; this site is one static page, so an unknown path is a mistake
    // and answering 200 to every one of them would tell a crawler otherwise.
    const block = nginx.match(/location\s+\/\s*\{([^}]*)\}/)?.[1];
    expect(block).toMatch(/try_files\s+\$uri\s+\$uri\/\s+=404;/);
  });

  it("never caches the page, and caches the hashed assets forever", () => {
    expect(nginx).toMatch(/location\s+=\s+\/index\.html\s*\{[^}]*no-store/);
    expect(nginx).toMatch(/location\s+\/assets\/\s*\{[^}]*immutable/);
  });
});

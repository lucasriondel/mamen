/**
 * The visit counter on the public deployment: a self-hosted Umami instance.
 *
 * One host, two containers. The landing page answers the site root and the
 * SPA answers `/app`, so both documents carry the tracker, and both must carry
 * the **same** website id or the site's visits split across two dashboards.
 * The landing page renders its head in TypeScript and reads this constant
 * (`packages/landing-page/src/page.tsx`); the SPA's head is `index.html`, which
 * Vite does not template, so `packages/web/index.html` repeats the literal and
 * `packages/web/src/test/analytics.test.ts` holds it to this value.
 *
 * `domains` is what keeps a self-hosted copy of mamen out of the count: the
 * script records nothing on any other host, a dev server and the demo stack
 * included. Umami sets no cookie and follows the SPA's client-side navigation
 * on its own, so the tag is the whole integration.
 */
export const ANALYTICS = {
  src: "https://stats.gousse.cool/script.js",
  websiteId: "a99f4ab2-8f4c-4b42-9d22-e41885218a8a",
  domains: "mamen.gousse.cool",
} as const;

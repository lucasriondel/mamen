import type { ScreenshotFigure } from "../content";

/**
 * Every surface the page ships, stacked in one frame and cross-faded.
 *
 * The hero used to lead with one screenshot and a section below it showed the
 * rest. There is no section now: the frames are the same size, they show the
 * same app, and a reader who has seen one has read the shape of the other —
 * so the page shows them where it already had a reader's attention, in the
 * one place it can afford the full column.
 *
 * **The fade is CSS and nothing else.** The page ships no JavaScript
 * (`docs/adr/0002-react-renders-the-landing-page-at-build-time.md`), so a
 * carousel with a timer is not on the table and would not survive the
 * prerender. What is on the table is one animation per frame, all of the same
 * duration, each delayed by its own share of it — the `n`th of `k` frames is
 * opaque for `1/k` of the cycle and transparent for the rest, and staggering
 * the delays walks the opaque window down the stack. Nothing coordinates them
 * beyond the shared duration, which is the property that makes it work with no
 * runtime at all.
 *
 * Every frame is absolutely positioned over the first, which stays in flow so
 * the stack has the height of the image rather than of nothing. They are the
 * same intrinsic size — the capture writes one viewport
 * (`src/screenshots/manifest.ts`) — so the frames land on top of each other
 * rather than jumping as they swap.
 *
 * Only the leading frame is described. The others are `aria-hidden` and their
 * `alt` is empty: a screen reader gets one description of the app rather than
 * two readings of a picture that visually replaces itself, and the surfaces
 * that never announce themselves are decoration by then. The `alt` text every
 * shot carries is still the README's, held equal in
 * `src/screenshots/sync.test.ts`; this decides which of them reaches the
 * accessibility tree, not what any of them say.
 *
 * `eager` on the first frame and `lazy` on the rest: the first is the thing a
 * visitor looks at before anything else, and the others are not needed until
 * the cycle reaches them.
 */
export function HeroScreenshotCycle({ figures }: { figures: readonly ScreenshotFigure[] }) {
  return (
    <figure className="hero-cycle" style={{ "--frames": figures.length } as CycleStyle}>
      {figures.map((figure, index) => (
        <HeroScreenshotFrame key={figure.name} figure={figure} index={index} />
      ))}
    </figure>
  );
}

/** The custom property the stylesheet reads to time one frame's turn. */
type CycleStyle = React.CSSProperties & { readonly "--frames": number };

/** The property carrying a frame's place in the cycle, for its delay. */
type FrameStyle = React.CSSProperties & { readonly "--frame": number };

/**
 * One frame of the cycle, in whichever colour scheme the reader is in.
 *
 * `<picture>` with one `prefers-color-scheme` source is the whole scheme
 * swap: the browser fetches the frame matching the reader's scheme and never
 * the other, which is both how it happens without a script and why the page
 * weighs half of what it ships. The README does the same thing with the same
 * files (`src/screenshots/sync.test.ts`).
 *
 * The intrinsic `width`/`height` come from the generated module rather than
 * from a guess: they are what lets the browser reserve the box before the
 * bytes arrive, so nothing below jumps when they land. The stylesheet scales
 * them back into the column.
 */
function HeroScreenshotFrame({ figure, index }: { figure: ScreenshotFigure; index: number }) {
  const leading = index === 0;

  return (
    <picture className="hero-frame" style={{ "--frame": index } as FrameStyle}>
      <source media="(prefers-color-scheme: dark)" srcSet={figure.dark.src} />
      <img
        src={figure.light.src}
        alt={leading ? figure.alt : ""}
        aria-hidden={leading ? undefined : true}
        width={figure.width}
        height={figure.height}
        loading={leading ? "eager" : "lazy"}
        decoding="async"
      />
    </picture>
  );
}

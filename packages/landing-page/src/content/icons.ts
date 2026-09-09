/**
 * The Lucide glyphs the feature list uses, as raw path data.
 *
 * Transcribed from `lucide-react` rather than imported from it, for the reason
 * everything else in this package is: the landing image carries no dependency
 * of the app's (issue #113), and this page ships no JavaScript at all — a React
 * icon component would put a runtime dependency in a document that has no
 * runtime. The web app imports the same names from the real package, which is
 * where an icon that has to *do* something belongs.
 *
 * The eight below are `__iconNode` from lucide-react, copied verbatim:
 * table-2, arrow-left-right, chart-pie, upload, wallet, building-2,
 * folder-tree, file-text. Lucide is ISC-licensed (see `LUCIDE_LICENSE`), which
 * permits this provided the notice travels with the copy — `icons.test.ts` is
 * what keeps it here.
 *
 * Each entry is the *inside* of a 24x24 `<svg>`; the frame, the stroke and the
 * sizing are `FeatureIcon`'s, so the shapes carry no presentation of their own
 * and every glyph is drawn identically.
 */

/** The one shape a glyph is made of. Only `path` is needed so far. */
export type IconShape = { kind: "path"; d: string };

export type IconName =
  | "table-2"
  | "arrow-left-right"
  | "chart-pie"
  | "upload"
  | "wallet"
  | "building-2"
  | "folder-tree"
  | "file-text";

/**
 * Lucide's copyright notice, reproduced because the ISC licence requires it to
 * accompany copies of the work. It is rendered at the foot of the page.
 */
export const LUCIDE_LICENSE =
  "Icons by Lucide — ISC License — Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2022.";

export const ICONS: Record<IconName, readonly IconShape[]> = {
  "table-2": [
    {
      kind: "path",
      d: "M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18",
    },
  ],
  "arrow-left-right": [
    { kind: "path", d: "M8 3 4 7l4 4" },
    { kind: "path", d: "M4 7h16" },
    { kind: "path", d: "m16 21 4-4-4-4" },
    { kind: "path", d: "M20 17H4" },
  ],
  "chart-pie": [
    {
      kind: "path",
      d: "M21 12c.552 0 1.005-.449.95-.998a10 10 0 0 0-8.953-8.951c-.55-.055-.998.398-.998.95v8a1 1 0 0 0 1 1z",
    },
    { kind: "path", d: "M21.21 15.89A10 10 0 1 1 8 2.83" },
  ],
  upload: [
    { kind: "path", d: "M12 3v12" },
    { kind: "path", d: "m17 8-5-5-5 5" },
    { kind: "path", d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" },
  ],
  wallet: [
    {
      kind: "path",
      d: "M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1",
    },
    { kind: "path", d: "M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" },
  ],
  "building-2": [
    { kind: "path", d: "M10 12h4" },
    { kind: "path", d: "M10 8h4" },
    { kind: "path", d: "M14 21v-3a2 2 0 0 0-4 0v3" },
    {
      kind: "path",
      d: "M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2",
    },
    { kind: "path", d: "M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16" },
  ],
  "folder-tree": [
    {
      kind: "path",
      d: "M20 10a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-2.5a1 1 0 0 1-.8-.4l-.9-1.2A1 1 0 0 0 15 3h-2a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1Z",
    },
    {
      kind: "path",
      d: "M20 21a1 1 0 0 0 1-1v-3a1 1 0 0 0-1-1h-2.9a1 1 0 0 1-.88-.55l-.42-.85a1 1 0 0 0-.92-.6H13a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1Z",
    },
    { kind: "path", d: "M3 5a2 2 0 0 0 2 2h3" },
    { kind: "path", d: "M3 3v13a2 2 0 0 0 2 2h3" },
  ],
  "file-text": [
    {
      kind: "path",
      d: "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",
    },
    { kind: "path", d: "M14 2v5a1 1 0 0 0 1 1h5" },
    { kind: "path", d: "M10 9H8" },
    { kind: "path", d: "M16 13H8" },
    { kind: "path", d: "M16 17H8" },
  ],
};

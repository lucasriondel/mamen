import { APP_BASE_PATH_SLASH } from "@mamen/shared";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppSidebar } from "./app-sidebar";

/**
 * The app's left navigation, rendered through gousse's `SidebarShell` (issues
 * #95, #105).
 *
 * The subject is the wiring the migration off the local stand-in could silently
 * break: the destinations and their order, client-side navigation, and the
 * active mark. The last one has two halves that can come apart — TanStack's
 * `Link` sets `aria-current` on its own, so a lost `activeProps` would leave the
 * row semantically active but visually identical to its siblings. Both are
 * asserted.
 *
 * Re-vendoring (#105) added the shell's own axis: `collapsed` drives the mobile
 * drawer and the desktop width-collapse off one flag, and the scrim reports back
 * through `onToggle`. jsdom computes no layout, so what is asserted here is the
 * contract the shell exposes — `inert`, the scrim's reachability, the handler —
 * rather than the pixels either breakpoint draws.
 *
 * The brand row is a link of its own since #107, so every query for a nav row is
 * scoped to the `<nav>` the group renders: unscoped, `getAllByRole("link")`
 * counts the brand among the destinations.
 */

/**
 * Every destination the sidebar offers, in the order it offers them, with the
 * Lucide id of the glyph that stands for it and the section it sits under.
 *
 * The glyph column is part of the destination and not an afterthought: a row is
 * scanned before it is read, so the mark is half of what tells two rows apart
 * (issue #126).
 *
 * The section column is `null` for Settings alone: it is rendered from the
 * footer rather than either group, because it configures the app instead of
 * naming one of its surfaces.
 */
const DESTINATIONS = [
  // Not an arrow pair. `ArrowLeftRight` was `ArrowRightLeft` mirrored, so at
  // 16px this row and the one below it were the same row twice; the arrows stay
  // with the concept that genuinely is directional (issue #126).
  ["Transactions", "/transactions", "receipt", "Money"],
  ["Transfers", "/transfers", "arrow-right-left", "Money"],
  // `chart-pie` and `building2` are the ids Lucide draws under; `PieChart` and
  // `Building2` are the export names, and for the first of those the two differ.
  ["Recap", "/recap", "chart-pie", "Money"],
  ["Import", "/import", "upload", "Data"],
  ["Accounts", "/accounts", "wallet", "Data"],
  ["Issuers", "/issuers", "building2", "Data"],
  ["Categories", "/categories", "folder-tree", "Data"],
  // Last, and below a rule: settings is where the app is configured rather than
  // where its money is looked at, so it sits under the feature surfaces in the
  // footer rather than in a group of its own.
  ["Settings", "/settings", "settings", null],
] as const;

/** The section headings, in order, as the panel renders them. */
const SECTIONS = ["Money", "Data"] as const;

/** Where the brand row goes: the app's root, which is its landing surface. */
const LANDING = "/";

type SidebarProps = Parameters<typeof AppSidebar>[0];

function renderSidebar(initialEntry = "/transactions", props: SidebarProps = {}) {
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <AppSidebar {...props} />
        <Outlet />
      </>
    ),
  });
  const routeTree = rootRoute.addChildren([
    // The landing surface the brand row points at. In the app it is an index
    // route that redirects onto the transactions view; here it renders, so a
    // click on the brand is observable as a navigation rather than a redirect.
    createRoute({
      getParentRoute: () => rootRoute,
      path: LANDING,
      component: () => <main>Landing page</main>,
    }),
    ...DESTINATIONS.map(([label, to]) =>
      createRoute({
        getParentRoute: () => rootRoute,
        path: to,
        component: () => <main>{label} page</main>,
      }),
    ),
  ]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  });
  render(<RouterProvider router={router} />);
  return router;
}

/**
 * Every destination row in the panel, in DOM order.
 *
 * Not scoped to a single `<nav>` any more: the nav is split into a Money group
 * and a Data group, and Settings sits in the footer outside both. `.sidebar-row`
 * is what the destinations share and the brand row does not — it is a link too
 * (#107), but it wears the primitive's title class — so selecting on it spans
 * every group and the footer while still leaving the brand out.
 */
const navItems = () => [...document.querySelectorAll<HTMLElement>("aside a.sidebar-row")];

/** The brand row — a link on the app's name, at the top of the panel. */
const brandRow = () => screen.getByRole("link", { name: "mamen" });

/**
 * A row's own styling, with TanStack's marker class removed.
 *
 * `Link` appends a bare `active` class to the current row whether or not
 * anything asked it to — that is its default `activeProps`. Comparing raw
 * `className` therefore finds a difference even when gousse's `active` variant
 * was never wired, which would leave the row muted like its siblings and the
 * mark invisible. Dropping the marker is what makes the comparison mean
 * "gousse's own styling flipped", and it stays honest if gousse restyles the
 * variant.
 */
const ownStyling = (row: Element) =>
  row.className
    .split(/\s+/)
    .filter((name) => name && name !== "active")
    .sort()
    .join(" ");

/**
 * The Lucide id of the glyph a row carries.
 *
 * Every Lucide icon puts `lucide-<id>` on its own `<svg>` — the library's output,
 * not something this call site writes — so which glyph a row got is readable from
 * the rendered tree without a test-only attribute threaded through the nav.
 */
const glyphOf = (row: Element) => {
  const svg = row.querySelector("svg");
  const id = Array.from(svg?.classList ?? [])
    .filter((name) => name.startsWith("lucide-"))
    .map((name) => name.slice("lucide-".length))
    .at(0);
  if (id === undefined) throw new Error(`no Lucide glyph on ${row.textContent}`);
  return id;
};

/**
 * The **family** of a glyph: its id's words, unordered.
 *
 * Lucide names a mirrored twin by permuting the direction words of the glyph it
 * mirrors — `arrow-left-right` and `arrow-right-left`, `move-up-left` and
 * `move-left-up`. Two ids are different strings, so id-distinctness alone happily
 * accepts the pair that started issue #126; sorting the words collapses each such
 * pair onto one key, which is the collision worth failing on.
 */
const glyphFamily = (id: string) => id.split("-").sort().join("-");

/** The shell itself — the panel the rows live in. */
const panel = () => document.querySelector("aside");

/** The mobile scrim, which is a button so it is a real dismiss target. */
const scrim = () => screen.findByRole("button", { name: "Close sidebar" });

describe("AppSidebar", () => {
  it("offers every destination, in order, as a router link", async () => {
    renderSidebar();

    await waitFor(() => expect(navItems()).toHaveLength(DESTINATIONS.length));
    expect(navItems().map((item) => [item.textContent, item.getAttribute("href")])).toStrictEqual(
      DESTINATIONS.map(([label, to]) => [label, to]),
    );
  });

  // The nav was one flat list of eight peers until the panel split it. The
  // grouping is the navigation structure itself, so what is asserted is which
  // rows landed under which heading — not merely that two headings render.
  it("files every destination under its section, in order", async () => {
    renderSidebar();

    await waitFor(() => expect(navItems()).toHaveLength(DESTINATIONS.length));

    // Each group is a named `<nav>`, so the heading is the region's accessible
    // name and the rows under it are that region's own links.
    const grouped = SECTIONS.map((section) => [
      section,
      within(screen.getByRole("navigation", { name: section }))
        .getAllByRole("link")
        .map((row) => row.textContent),
    ]);

    expect(grouped).toStrictEqual(
      SECTIONS.map((section) => [
        section,
        DESTINATIONS.filter(([, , , belongs]) => belongs === section).map(([label]) => label),
      ]),
    );
  });

  it("renders each section's heading above its rows", async () => {
    renderSidebar();

    await waitFor(() => expect(navItems()).toHaveLength(DESTINATIONS.length));
    // The heading is inside the `<nav>` it names, ahead of the first row —
    // which is what makes it the region's accessible name rather than a label
    // floating beside it.
    for (const section of SECTIONS) {
      const group = screen.getByRole("navigation", { name: section });
      const heading = within(group).getByText(section);
      expect(group.firstElementChild).toBe(heading);
    }
  });

  it("marks the current route, and only it, as the current page", async () => {
    renderSidebar("/recap");

    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Recap" })).toHaveAttribute("aria-current", "page"),
    );
    const marked = navItems().filter((item) => item.getAttribute("aria-current") === "page");
    expect(marked).toHaveLength(1);
  });

  it("styles the current row apart from its siblings", async () => {
    renderSidebar("/recap");

    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Recap" })).toHaveAttribute("aria-current", "page"),
    );
    const active = screen.getByRole("link", { name: "Recap" });
    const inactive = screen.getByRole("link", { name: "Import" });
    expect(ownStyling(active)).not.toBe(ownStyling(inactive));
    // …and every other row is styled alike, so the mark is the odd one out
    // rather than seven variations.
    const others = navItems()
      .filter((row) => row !== active)
      .map(ownStyling);
    expect(new Set(others).size).toBe(1);
  });

  // The icon used to be a child of the row alongside the label; it is now a
  // prop the primitive places in its own slot. Losing the prop is invisible to
  // every assertion above, since an icon contributes no text.
  it("gives every row its icon", async () => {
    renderSidebar();

    await waitFor(() => expect(navItems()).toHaveLength(DESTINATIONS.length));
    const withIcon = navItems().filter((row) => row.querySelector("svg"));
    expect(withIcon).toHaveLength(DESTINATIONS.length);
  });

  // #126: which glyph, not merely that there is one. Transactions carries a
  // receipt — a thing you are handed per purchase — and the arrows stay on
  // Transfers, where the direction they draw is the whole concept.
  it("gives every row the glyph that stands for its destination", async () => {
    renderSidebar();

    await waitFor(() => expect(navItems()).toHaveLength(DESTINATIONS.length));
    expect(navItems().map(glyphOf)).toStrictEqual(DESTINATIONS.map(([, , glyph]) => glyph));
  });

  // #126's general rule, so the next row added cannot re-create the collision:
  // a glyph is how a row is found without reading it, which only works while a
  // glyph names one destination.
  it("gives no two rows the same glyph, or a mirrored twin of one", async () => {
    renderSidebar();

    await waitFor(() => expect(navItems()).toHaveLength(DESTINATIONS.length));
    const glyphs = navItems().map(glyphOf);
    expect(new Set(glyphs).size).toBe(DESTINATIONS.length);
    // The collision that started #126, and the only net that catches it: a
    // mirrored twin's markup *differs* — `arrow-left-right` and
    // `arrow-right-left` are four different `d` values — so neither the id
    // check above nor the geometry check below sees it. What repeats is the
    // reading at 16px, and the id's words are the readable trace of that.
    expect(new Set(glyphs.map(glyphFamily)).size).toBe(DESTINATIONS.length);
    // The converse case, which the words miss: two ids that share no word can
    // be one drawing — `clock` and `clock-4` are byte-identical icon nodes in
    // this Lucide. Geometry is the last word on those.
    const drawings = navItems().map((row) => row.querySelector("svg")?.innerHTML);
    expect(new Set(drawings).size).toBe(DESTINATIONS.length);
  });

  it("navigates client-side, moving the mark with the route", async () => {
    const user = userEvent.setup();
    const router = renderSidebar("/transactions");

    await waitFor(() => expect(navItems()).toHaveLength(DESTINATIONS.length));
    await user.click(screen.getByRole("link", { name: "Accounts" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/accounts"));
    expect(await screen.findByText("Accounts page")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Accounts" })).toHaveAttribute(
        "aria-current",
        "page",
      ),
    );
    expect(screen.getByRole("link", { name: "Transactions" })).not.toHaveAttribute("aria-current");
  });

  it("keeps the brand above the nav", async () => {
    renderSidebar();

    expect(await screen.findByText("mamen")).toBeInTheDocument();
  });

  // #127: the theme moved to `/settings`. It is a preference, not a
  // destination, and the sidebar is the one piece of chrome every page shows.
  it("carries no theme control of any kind", async () => {
    renderSidebar();

    await waitFor(() => expect(navItems()).toHaveLength(DESTINATIONS.length));
    expect(screen.queryByRole("button", { name: /Switch to (light|dark) theme/ })).toBeNull();
    // Not just the button this shipped as: no control here is about the theme,
    // whatever shape it takes.
    expect(screen.queryByLabelText(/theme/i)).toBeNull();
  });

  it("leaves Settings the bottom-most thing in the panel", async () => {
    renderSidebar();

    await waitFor(() => expect(navItems()).toHaveLength(DESTINATIONS.length));
    const settings = screen.getByRole("link", { name: "Settings" });
    expect(navItems().at(-1)).toBe(settings);
    // Settings is in the footer, which is the shell's last child and pins
    // itself with `mt-auto` — so the row stays at the bottom of the panel
    // however short the nav above it is, rather than merely trailing the last
    // row of Data. Both halves are asserted: the position, and the pin that
    // holds it there once the content region stops filling the height.
    // The footer is the last child of the shell's inner column, not of the
    // `<aside>` itself — the shell wraps its regions in a fixed-width column so
    // they don't reflow while the panel animates.
    const column = document.querySelector("aside > *:last-child");
    const footer = [...(column?.children ?? [])].at(-1);
    expect(footer).toContainElement(settings);
    expect(footer).toHaveClass("mt-auto");
    // And it is outside the scrolling region, so it does not scroll away.
    expect(settings.closest(".sidebar-scroll")).toBeNull();
  });

  it("leaves every row unhued, on the neutral resting surface", async () => {
    renderSidebar();

    await waitFor(() => expect(navItems()).toHaveLength(DESTINATIONS.length));
    // `--hue` is the primitive's per-row accent, for consumers whose rows
    // carry their own colour. mamen's destinations have none, so no row may
    // set it — the chrome sheet then falls back to the accent at rest.
    for (const row of navItems()) {
      expect(row.getAttribute("style") ?? "").not.toContain("--hue");
    }
  });
});

describe("AppSidebar, as a shell", () => {
  it("renders the nav inside the shell, open by default", async () => {
    renderSidebar();

    await waitFor(() => expect(navItems()).toHaveLength(DESTINATIONS.length));
    expect(panel()).not.toBeNull();
    expect(panel()).not.toHaveAttribute("inert");
    expect(panel()).toContainElement(navItems()[0] as HTMLElement);
  });

  it("takes the rows out of the tab order and the a11y tree when collapsed", async () => {
    renderSidebar("/transactions", { collapsed: true });

    // One attribute carries both halves — the browser derives the tab order
    // and the a11y tree from it. jsdom implements neither effect, so the
    // attribute is the assertion.
    await waitFor(() => expect(panel()).toHaveAttribute("inert"));
  });

  it("hands the scrim's dismissal back to the caller", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    renderSidebar("/transactions", { onToggle });

    await user.click(await scrim());

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("keeps the scrim out of the tab order while collapsed", async () => {
    renderSidebar("/transactions", { collapsed: true });

    expect(await scrim()).toHaveAttribute("tabindex", "-1");
  });

  // #106: the panel's own half of the affordance. Closing is driven from inside
  // the header, opposite the brand row; the control that re-opens it belongs to
  // the top bar, outside the panel, because a collapsed sidebar has nothing left
  // to click.
  it("offers a named close control in the header, beside the brand", async () => {
    renderSidebar();

    const close = await screen.findByRole("button", {
      name: "Collapse sidebar",
    });
    // Siblings in the header, which lays the two out with `justify-between`.
    // Neither is wrapped in layout of the call site's own (#107).
    expect(close.parentElement).toBe(brandRow().parentElement);
  });

  it("hands the close control's press back to the caller", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    renderSidebar("/transactions", { onToggle });

    await user.click(await screen.findByRole("button", { name: "Collapse sidebar" }));

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("offers no way to re-open from inside the panel", async () => {
    renderSidebar("/transactions", { collapsed: true });

    await waitFor(() => expect(panel()).toHaveAttribute("inert"));
    // The open trigger lives in the top bar (`AppShell`). One inside the
    // collapsed panel would be inert, and so unreachable.
    expect(screen.queryByRole("button", { name: "Open sidebar" })).toBeNull();
  });
});

/**
 * The brand row (#107) — gousse's `SidebarTitle`, where the mark and the name
 * used to be an image and a span written out at this call site.
 *
 * Two things can silently come apart in that swap: the row is a router link now,
 * so it has to reach the landing surface without a reload, and the treatment it
 * gains is the primitive's — a copy of those classes left behind here is exactly
 * the drift adopting the primitive is meant to end.
 */
describe("AppSidebar, the brand row", () => {
  it("names the app, and reaches its landing surface", async () => {
    renderSidebar();

    await waitFor(() => expect(brandRow()).toHaveAttribute("href", LANDING));
  });

  it("navigates client-side, like the rows below it", async () => {
    const user = userEvent.setup();
    const router = renderSidebar("/recap");

    await waitFor(() => expect(brandRow()).toBeInTheDocument());
    await user.click(brandRow());

    await waitFor(() => expect(router.state.location.pathname).toBe(LANDING));
    expect(await screen.findByText("Landing page")).toBeInTheDocument();
  });

  it("puts the app icon in the primitive's mark slot", async () => {
    renderSidebar();

    await waitFor(() => expect(brandRow()).toBeInTheDocument());
    const icon = brandRow().querySelector("img");
    expect(icon).not.toBeNull();
    // The slot is a fixed square the primitive reserves, so the name lands on
    // the same line with or without a mark. A bare image dropped in as a child
    // of the row would still show, and would still be wrong.
    const slot = icon?.parentElement;
    expect(slot).not.toBe(brandRow());
    expect(slot).toHaveClass("grid", "shrink-0", "place-items-center");
    expect(icon).toHaveAttribute("aria-hidden");
  });

  it("points the mark at the icon where the prefix actually serves it", async () => {
    renderSidebar();

    await waitFor(() => expect(brandRow()).toBeInTheDocument());
    const icon = brandRow().querySelector("img");
    // `public/` is copied under the app's base, so `/icon-192x192.png` is a
    // path nothing serves once the SPA moves under a prefix (issue #111).
    // Vite rewrites rooted URLs in `index.html` and in CSS, but not in a
    // `src` written in TSX — that one is a string it never parses as a URL,
    // which is exactly why this is asserted rather than assumed.
    expect(icon).toHaveAttribute("src", `${APP_BASE_PATH_SLASH}icon-192x192.png`);
  });

  it("wears the primitive's accent treatment", async () => {
    renderSidebar();

    await waitFor(() => expect(brandRow()).toBeInTheDocument());
    // The visible change the issue asks for: accent-coloured, bold, tightly
    // tracked — and the whole row fading together on hover, which is why the
    // transition sits on the row rather than on the name alone.
    expect(brandRow()).toHaveClass(
      "text-gousse-accent",
      "font-bold",
      "tracking-tight",
      "hover:opacity-80",
    );
  });
});

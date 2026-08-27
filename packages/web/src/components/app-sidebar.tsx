import { APP_BASE_PATH_SLASH } from "@mamen/shared";
import { createLink } from "@tanstack/react-router";
import {
  ArrowRightLeft,
  Building2,
  FolderTree,
  type LucideIcon,
  PieChart,
  Receipt,
  Settings,
  Upload,
  Wallet,
} from "lucide-react";
import type { ComponentProps, ReactNode, Ref } from "react";
import {
  SidebarClose,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarItem,
  SidebarShell,
  SidebarTitle,
} from "@/components/ui/sidebar";

// `public/` is copied under the app's base, so a root-relative spelling of this
// icon is a path nothing serves once the SPA moves under a prefix (issue #111).
// Vite rewrites rooted URLs in `index.html` and in CSS, but not one written as a
// `src` in TSX — that is a string it never parses as a URL — so the prefix is
// applied here rather than assumed.
const iconSrc = `${APP_BASE_PATH_SLASH}icon-192x192.png`;

type SidebarBrandRowProps = Omit<ComponentProps<"a">, "children"> & {
  /** Rendered in the primitive's fixed mark slot, ahead of the name. */
  mark?: ReactNode;
  children?: ReactNode;
};

/**
 * The brand row — mark plus product name — rendered as an `<a>`.
 *
 * Same division as `SidebarNavRow`: `SidebarTitle` renders a plain `<div>` by
 * default (a brand row that goes nowhere is not a link) and takes `render` for
 * anything else, so the primitive stays router-agnostic and the call site
 * supplies the link. `className` goes to the primitive rather than the anchor
 * for the same reason it does there — `render` computes the final class string.
 */
function SidebarBrandRow({ mark, className, children, ...anchor }: SidebarBrandRowProps) {
  return (
    <SidebarTitle
      mark={mark}
      className={className}
      // oxlint-disable-next-line jsx-a11y/anchor-has-content -- the primitive injects `children` into whatever `render` returns; the content is real, just not visible from here
      render={(row) => <a {...anchor} {...row} />}
    >
      {children}
    </SidebarTitle>
  );
}

const SidebarBrand = createLink(SidebarBrandRow);

type SidebarNavRowProps = Omit<ComponentProps<"a">, "children"> & {
  /** Rendered in the row's glyph slot. */
  icon?: ReactNode;
  /** gousse's own active styling. */
  active?: boolean;
  children?: ReactNode;
};

/**
 * A nav row rendered as an `<a>`.
 *
 * gousse's `SidebarItem` renders a `<button>` by default and takes `render` for
 * anything else, which keeps the primitive free of a router dependency. This is
 * the slot TanStack's `createLink` asks for: the router builds the `href`, owns
 * the click and merges `activeProps` into the props the row receives, so the row
 * keeps both halves of the active mark — the router's `aria-current`, and
 * gousse's own `active` styling. The row chrome keys its active rules off
 * `aria-current="page"` as well as `data-active`, so the mark survives even
 * though nothing here sets the data attribute.
 *
 * `className` is pulled out of the anchor props and handed to the primitive
 * rather than spread onto the `<a>`: `render` computes the final class string,
 * so an anchor-level `className` would be overwritten — and TanStack's default
 * `activeProps` puts its `active` marker class there.
 */
function SidebarNavRow({ icon, active, className, children, ...anchor }: SidebarNavRowProps) {
  return (
    <SidebarItem
      active={active}
      icon={icon}
      className={className}
      // oxlint-disable-next-line jsx-a11y/anchor-has-content -- the primitive injects `children` into whatever `render` returns; the content is real, just not visible from here
      render={(row) => <a {...anchor} {...row} />}
    >
      {children}
    </SidebarItem>
  );
}

const SidebarLink = createLink(SidebarNavRow);

interface NavLink {
  to: string;
  label: string;
  icon: LucideIcon;
}

interface NavSection {
  /** The section heading, rendered through `SidebarGroupLabel`. */
  label: string;
  links: readonly NavLink[];
}

/**
 * The primary navigation surfaces, in sidebar order, under the two headings the
 * nav is split by.
 *
 * The split is by *what a row is for*, not by what it operates on — every row
 * here touches money in some sense, so that reading would put all eight in one
 * group again. **Money** is where the money is looked at: the ledger, the
 * transfers between accounts, the summary over both. **Data** is where the
 * material behind those views is put in and maintained — the importer and the
 * three reference lists it resolves rows against. A destination belongs to the
 * group whose question it answers, which is why Recap sits with Transactions
 * rather than with the lists it aggregates.
 *
 * Settings is in neither: it configures the app rather than naming a surface,
 * and it is rendered from the footer below.
 *
 * **One glyph, one destination** (issue #126). A row is scanned before it is
 * read, so a glyph that names two rows costs the nav the only thing it offers
 * over a list of words. Mirrored twins count as one glyph: `ArrowLeftRight` and
 * `ArrowRightLeft` are the same drawing flipped, and at 16px nothing tells them
 * apart — which is why `Receipt` is here and the arrows are Transfers' alone.
 * The rule holds across the groups, not within each: two sections do not make a
 * repeated glyph readable, since the eye scans the panel as one column.
 *
 * The arrows staying there is the substantive half, and the app had already
 * decided it: `TransferBadge` marks a transfer row with `ArrowLeftRight` — the
 * very glyph this row gave up — and `rules-section.tsx` declines the pair on a
 * rule move because it "already reads as the transaction transfer feature". So
 * the arrow family means *transfer* app-wide, which is the reason Transactions
 * could not keep it: the row was not merely hard to tell from its neighbour, it
 * was wearing the neighbour's meaning.
 */
const NAV_SECTIONS: readonly NavSection[] = [
  {
    label: "Money",
    links: [
      { to: "/transactions", label: "Transactions", icon: Receipt },
      { to: "/transfers", label: "Transfers", icon: ArrowRightLeft },
      { to: "/recap", label: "Recap", icon: PieChart },
    ],
  },
  {
    label: "Data",
    links: [
      { to: "/import", label: "Import", icon: Upload },
      { to: "/accounts", label: "Accounts", icon: Wallet },
      { to: "/issuers", label: "Issuers", icon: Building2 },
      { to: "/categories", label: "Categories", icon: FolderTree },
    ],
  },
];

/**
 * Settings, which the footer renders below the hairline rather than the content
 * region: it configures the app instead of naming one of its surfaces, so it
 * belongs to neither group above.
 */
const SETTINGS_LINK: NavLink = { to: "/settings", label: "Settings", icon: Settings };

interface AppSidebarProps {
  /** Drives both axes of the shell: the mobile drawer and the desktop width. */
  collapsed?: boolean;
  /** What the header's close control and the mobile scrim call. */
  onToggle?: () => void;
  /**
   * The header's close button. The shell hands focus back to it when the panel
   * re-opens, which it can only do if it can reach the element.
   */
  closeRef?: Ref<HTMLButtonElement>;
}

/**
 * The app's left navigation: the brand, the feature surfaces under the two
 * headings `NAV_SECTIONS` splits them by, then Settings pinned to the bottom.
 *
 * The nav was one unlabelled group until the panel carried eight peers with
 * nothing to break the column; **Money** and **Data** name the two questions
 * those rows answer, and `SidebarContent`'s `gap-6` is what separates them.
 *
 * **The footer is back, and holds Settings.** It last held the theme toggle,
 * which moved to `/settings` (issue #127), and was dropped rather than left
 * childless — an empty one would have floated its hairline at the bottom of the
 * panel. With Settings in it the rule has something to divide again: the row
 * configures the app rather than naming a surface, so it belongs outside both
 * groups, and `mt-auto` keeps it at the bottom however short the nav gets.
 *
 * Rows are deliberately **unhued**. `SidebarItem`'s `hue` prop exists for
 * consumers whose rows carry their own colour — a label list, a category tree —
 * and mamen's nav is a flat list of fixed destinations. Left unset, the chrome
 * sheet resolves `--hue` to the accent, which is the intended resting state.
 *
 * `collapsed` is a prop rather than local state: the flag drives the layout row
 * this panel sits in, and the control that re-opens it lives outside the panel
 * entirely. `AppShell` owns both, and persists the flag.
 */
export function AppSidebar({ collapsed, onToggle, closeRef }: AppSidebarProps) {
  return (
    // gousse's shell is layout-agnostic — it sizes itself and stops there.
    // `AppShell` lays it out as a flex row beside a scrolling `main`, so pinning
    // it against shrink is the call site's job, as it was on the stand-in.
    <SidebarShell className="shrink-0" collapsed={collapsed} onToggle={onToggle}>
      <SidebarHeader>
        {/* The brand row needs no layout of its own: the header lays it out
         * against the close control with `justify-between`. It points at `/`,
         * which is the app's landing surface — the index route redirects onto
         * the transactions view, so naming the destination here would fork
         * that decision in a second place. The mark is `aria-hidden`; the
         * link's accessible name is the product name beside it. */}
        <SidebarBrand
          to="/"
          mark={<img src={iconSrc} alt="" aria-hidden className="size-6 rounded-md" />}
        >
          mamen
        </SidebarBrand>
        {/* Closing is driven from inside the panel, opposite the brand; the
         * control that re-opens it is `SidebarTrigger` in `AppShell`'s top
         * bar, because a collapsed panel is `inert` and has nothing left to
         * click. */}
        <SidebarClose ref={closeRef} onClick={onToggle} />
      </SidebarHeader>
      <SidebarContent>
        {NAV_SECTIONS.map(({ label, links }) => (
          // The heading labels the group it introduces, so it goes inside the
          // `<nav>` rather than beside it: that gives each section an accessible
          // name and leaves the panel with two named navigation regions instead
          // of one anonymous one.
          <SidebarGroup key={label} aria-label={label}>
            <SidebarGroupLabel>{label}</SidebarGroupLabel>
            {links.map(({ to, label: rowLabel, icon: Icon }) => (
              <SidebarLink
                key={to}
                to={to}
                icon={<Icon size={16} />}
                activeProps={{ active: true }}
              >
                {rowLabel}
              </SidebarLink>
            ))}
          </SidebarGroup>
        ))}
      </SidebarContent>
      {/* Pinned to the bottom by the primitive's own `mt-auto`, under the inset
       * hairline it draws — so Settings sits apart from the two groups however
       * short the nav is, rather than trailing the last row of Data. */}
      <SidebarFooter>
        <SidebarLink
          to={SETTINGS_LINK.to}
          icon={<SETTINGS_LINK.icon size={16} />}
          activeProps={{ active: true }}
        >
          {SETTINGS_LINK.label}
        </SidebarLink>
      </SidebarFooter>
    </SidebarShell>
  );
}

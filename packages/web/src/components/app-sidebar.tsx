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
	SidebarGroup,
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
function SidebarBrandRow({
	mark,
	className,
	children,
	...anchor
}: SidebarBrandRowProps) {
	return (
		<SidebarTitle
			mark={mark}
			className={className}
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
function SidebarNavRow({
	icon,
	active,
	className,
	children,
	...anchor
}: SidebarNavRowProps) {
	return (
		<SidebarItem
			active={active}
			icon={icon}
			className={className}
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

/**
 * The primary navigation surfaces, in sidebar order.
 *
 * **One glyph, one destination** (issue #126). A row is scanned before it is
 * read, so a glyph that names two rows costs the nav the only thing it offers
 * over a list of words. Mirrored twins count as one glyph: `ArrowLeftRight` and
 * `ArrowRightLeft` are the same drawing flipped, and at 16px nothing tells them
 * apart — which is why `Receipt` is here and the arrows are Transfers' alone.
 *
 * The arrows staying there is the substantive half, and the app had already
 * decided it: `TransferBadge` marks a transfer row with `ArrowLeftRight` — the
 * very glyph this row gave up — and `rules-section.tsx` declines the pair on a
 * rule move because it "already reads as the transaction transfer feature". So
 * the arrow family means *transfer* app-wide, which is the reason Transactions
 * could not keep it: the row was not merely hard to tell from its neighbour, it
 * was wearing the neighbour's meaning.
 */
const NAV_LINKS: readonly NavLink[] = [
	{ to: "/transactions", label: "Transactions", icon: Receipt },
	{ to: "/transfers", label: "Transfers", icon: ArrowRightLeft },
	{ to: "/recap", label: "Recap", icon: PieChart },
	{ to: "/import", label: "Import", icon: Upload },
	{ to: "/accounts", label: "Accounts", icon: Wallet },
	{ to: "/issuers", label: "Issuers", icon: Building2 },
	{ to: "/categories", label: "Categories", icon: FolderTree },
	// Below the feature surfaces: settings is where the app is configured, not
	// where the money is looked at. One flat list still, per the group's note.
	{ to: "/settings", label: "Settings", icon: Settings },
];

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
 * The app's left navigation: the brand, then links to the feature surfaces. One
 * unlabelled `SidebarGroup` holds the whole nav — the destinations are a single
 * flat list, and splitting them into labelled sections would be new navigation
 * structure, not a migration.
 *
 * **No footer** (issue #127). It held the theme toggle, which now lives on
 * `/settings` with the app's other preferences: theme is a choice made once,
 * and the sidebar is the one piece of chrome every page pays for. `SidebarFooter`
 * draws a top border and pins itself with `mt-auto`, so an emptied one would
 * leave a rule floating at the bottom of the panel — it is dropped rather than
 * left childless, which is what makes `Settings`, already last in the list, the
 * bottom-most row.
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
		<SidebarShell
			className="shrink-0"
			collapsed={collapsed}
			onToggle={onToggle}
		>
			<SidebarHeader>
				{/* The brand row needs no layout of its own: the header lays it out
				 * against the close control with `justify-between`. It points at `/`,
				 * which is the app's landing surface — the index route redirects onto
				 * the transactions view, so naming the destination here would fork
				 * that decision in a second place. The mark is `aria-hidden`; the
				 * link's accessible name is the product name beside it. */}
				<SidebarBrand
					to="/"
					mark={
						<img
							src={iconSrc}
							alt=""
							aria-hidden
							className="size-6 rounded-md"
						/>
					}
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
				<SidebarGroup>
					{NAV_LINKS.map(({ to, label, icon: Icon }) => (
						<SidebarLink
							key={to}
							to={to}
							icon={<Icon size={16} />}
							activeProps={{ active: true }}
						>
							{label}
						</SidebarLink>
					))}
				</SidebarGroup>
			</SidebarContent>
		</SidebarShell>
	);
}

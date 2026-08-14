import { createLink } from "@tanstack/react-router";
import {
	ArrowLeftRight,
	ArrowRightLeft,
	Building2,
	FolderTree,
	type LucideIcon,
	PieChart,
	Upload,
	Wallet,
} from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import {
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarHeader,
	SidebarItem,
	SidebarShell,
} from "@/components/ui/sidebar";

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

/** The primary navigation surfaces, in sidebar order. */
const NAV_LINKS: readonly NavLink[] = [
	{ to: "/transactions", label: "Transactions", icon: ArrowLeftRight },
	{ to: "/transfers", label: "Transfers", icon: ArrowRightLeft },
	{ to: "/recap", label: "Recap", icon: PieChart },
	{ to: "/import", label: "Import", icon: Upload },
	{ to: "/accounts", label: "Accounts", icon: Wallet },
	{ to: "/issuers", label: "Issuers", icon: Building2 },
	{ to: "/categories", label: "Categories", icon: FolderTree },
];

interface AppSidebarProps {
	/** Drives both axes of the shell: the mobile drawer and the desktop width. */
	collapsed?: boolean;
	/** What the mobile scrim calls. */
	onToggle?: () => void;
}

/**
 * The app's left navigation: brand, links to the feature surfaces, and the
 * theme toggle pinned to the bottom. One unlabelled `SidebarGroup` holds the
 * whole nav — the destinations are a single flat list, and splitting them into
 * labelled sections would be new navigation structure, not a migration.
 *
 * Rows are deliberately **unhued**. `SidebarItem`'s `hue` prop exists for
 * consumers whose rows carry their own colour — a label list, a category tree —
 * and mamen's nav is a flat list of fixed destinations. Left unset, the chrome
 * sheet resolves `--hue` to the accent, which is the intended resting state.
 *
 * `collapsed` is a prop rather than local state: the panel has no control of its
 * own yet, so nothing here can flip it. The close button, the top-bar trigger
 * and somewhere for the state to live are issue #106.
 */
export function AppSidebar({ collapsed, onToggle }: AppSidebarProps) {
	return (
		// gousse's shell is layout-agnostic — it sizes itself and stops there. The
		// root lays it out as a flex row beside a scrolling `main`, so pinning it
		// against shrink is the call site's job, as it was on the stand-in.
		<SidebarShell
			className="shrink-0"
			collapsed={collapsed}
			onToggle={onToggle}
		>
			<SidebarHeader>
				{/* The brand row is still hand-written markup; gousse's `SidebarTitle`
				 * replaces it in #107. The wrapper is what keeps the mark and the name
				 * together against the header's `justify-between`, which exists to put
				 * the close control on the other side. */}
				<div className="flex items-center gap-2 font-bold">
					<img
						src="/icon-192x192.png"
						alt=""
						aria-hidden
						className="size-6 rounded-md"
					/>
					<span>mamen</span>
				</div>
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
			<SidebarFooter>
				<ThemeToggle className="w-full" />
			</SidebarFooter>
		</SidebarShell>
	);
}

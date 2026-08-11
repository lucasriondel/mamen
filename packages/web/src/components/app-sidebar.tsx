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
import { ThemeToggle } from "@/components/theme-toggle";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarHeader,
	SidebarItem,
} from "@/components/ui/sidebar";

/**
 * `SidebarItem` renders the `<a>` itself and forwards every anchor prop, which
 * is exactly the slot TanStack's `createLink` asks for: the router builds the
 * `href`, owns the click, and merges `activeProps` into the props the row
 * receives. That is how the row keeps both halves of the active mark — the
 * router's `aria-current`, and gousse's own `active` styling variant.
 */
const SidebarLink = createLink(SidebarItem);

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

/**
 * The app's left navigation: brand, links to the feature surfaces, and the
 * theme toggle pinned to the bottom. One unlabelled `SidebarGroup` holds the
 * whole nav — the destinations are a single flat list, and splitting them into
 * labelled sections would be new navigation structure, not a migration.
 */
export function AppSidebar() {
	return (
		// gousse's shell is layout-agnostic — it sizes itself and stops there. The
		// root lays it out as a flex row beside a scrolling `main`, so pinning it
		// against shrink is the call site's job, as it was on the stand-in.
		<Sidebar className="shrink-0">
			<SidebarHeader>
				<img
					src="/icon-192x192.png"
					alt=""
					aria-hidden
					className="size-6 rounded-md"
				/>
				<span>mamen</span>
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
		</Sidebar>
	);
}

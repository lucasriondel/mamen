import { Link } from "@tanstack/react-router";
import {
	ArrowLeftRight,
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
	SidebarHeader,
	SidebarNav,
	SidebarNavItem,
} from "@/components/ui/sidebar";

interface NavLink {
	to: string;
	label: string;
	icon: LucideIcon;
}

/** The primary navigation surfaces, in sidebar order. */
const NAV_LINKS: readonly NavLink[] = [
	{ to: "/transactions", label: "Transactions", icon: ArrowLeftRight },
	{ to: "/recap", label: "Recap", icon: PieChart },
	{ to: "/import", label: "Import", icon: Upload },
	{ to: "/accounts", label: "Accounts", icon: Wallet },
	{ to: "/issuers", label: "Issuers", icon: Building2 },
	{ to: "/categories", label: "Categories", icon: FolderTree },
];

/**
 * The app's left navigation: brand, links to the feature surfaces, and the
 * theme toggle pinned to the bottom. The active route is highlighted via
 * TanStack Router's `activeProps`.
 */
export function AppSidebar() {
	return (
		<Sidebar>
			<SidebarHeader>mamen</SidebarHeader>
			<SidebarNav>
				{NAV_LINKS.map(({ to, label, icon: Icon }) => (
					<SidebarNavItem key={to}>
						<Link
							to={to}
							className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted transition-colors hover:bg-bg hover:text-ink"
							activeProps={{
								className: "bg-bg font-medium text-ink",
							}}
						>
							<Icon size={16} />
							<span>{label}</span>
						</Link>
					</SidebarNavItem>
				))}
			</SidebarNav>
			<ThemeToggle />
		</Sidebar>
	);
}

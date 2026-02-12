import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
	CalendarDays,
	CreditCard,
	FileText,
	Inbox,
	LayoutDashboard,
	Receipt,
	Repeat,
	Settings,
	Store,
	Tag,
} from "lucide-react";
import { AnimatedCounter } from "@/components/AnimatedCounter";
import { useFocusMode } from "@/context/FocusModeContext";
import { useSubscriptions } from "@/features/subscriptions/hooks/useSubscriptions";
import { useCurrentMonthCount } from "@/hooks/useCurrentMonthCount";
import { useUnmatchedCount } from "@/hooks/useUnmatchedCount";
import { accountsApi, merchantsApi, queryKeys, rulesApi } from "@/lib/api";
import { cn } from "@/lib/utils";

type NavItem = {
	to: string;
	label: string;
	icon: React.ReactNode;
};

const navItems: NavItem[] = [
	{
		to: "/",
		label: "Dashboard",
		icon: <LayoutDashboard className="h-4 w-4" />,
	},
	{
		to: "/transactions",
		label: "Transactions",
		icon: <Receipt className="h-4 w-4" />,
	},
	{ to: "/merchants", label: "Merchants", icon: <Store className="h-4 w-4" /> },
	{ to: "/rules", label: "Rules", icon: <FileText className="h-4 w-4" /> },
	{ to: "/categories", label: "Categories", icon: <Tag className="h-4 w-4" /> },
	{
		to: "/accounts",
		label: "Accounts",
		icon: <CreditCard className="h-4 w-4" />,
	},
	{
		to: "/settings",
		label: "Settings",
		icon: <Settings className="h-4 w-4" />,
	},
];

const baseLinkClass =
	"group relative flex items-center gap-3 px-3 py-2 rounded-md text-sidebar-foreground hover:bg-sidebar-accent/60 hover:translate-x-0.5 transition-all duration-200";

const activeIndicatorClass = [
	"is-active text-sidebar-primary-foreground bg-sidebar-accent",
	"before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2",
	"before:h-4 before:w-[3px] before:rounded-full before:bg-sidebar-indicator",
].join(" ");

export function Sidebar(): React.ReactElement {
	const { count: unmatchedCount } = useUnmatchedCount();
	const monthCount = useCurrentMonthCount();
	const { count: subscriptionCount } = useSubscriptions();
	const { activeFilters, toggleFocusMode, setFocusMode } = useFocusMode();
	const navigate = useNavigate();

	const { data: merchantCount = 0 } = useQuery({
		queryKey: [...queryKeys.merchants.all, "count"],
		queryFn: () => merchantsApi.getAll().then((m) => m.length),
	});

	const { data: accountCount = 0 } = useQuery({
		queryKey: [...queryKeys.accounts.all, "count"],
		queryFn: () => accountsApi.getAll().then((a) => a.length),
	});

	const { data: ruleCount = 0 } = useQuery({
		queryKey: [...queryKeys.rules.all, "count"],
		queryFn: () => rulesApi.getAll().then((r) => r.length),
	});

	const handleTransactionsClick = (): void => {
		setFocusMode("all");
	};

	const handleMonthClick = (): void => {
		toggleFocusMode("month");
		navigate({ to: "/transactions" });
	};

	const handleSubscriptionsClick = (): void => {
		toggleFocusMode("subscriptions");
		navigate({ to: "/transactions" });
	};

	return (
		<aside className="flex flex-col w-[220px] border-r border-sidebar-border bg-sidebar p-4">
			<nav className="flex flex-col gap-1">
				{navItems.map((item, i) => (
					<motion.div
						key={item.to}
						initial={{ opacity: 0, x: -8 }}
						animate={{ opacity: 1, x: 0 }}
						transition={{
							duration: 0.25,
							delay: i * 0.04,
							ease: [0.22, 1, 0.36, 1],
						}}
					>
						<Link
							to={item.to}
							onClick={
								item.to === "/transactions" ? handleTransactionsClick : undefined
							}
							className={baseLinkClass}
							activeProps={{
								className: activeIndicatorClass,
							}}
							activeOptions={{
								exact: item.to === "/" || item.to === "/transactions",
							}}
						>
							<span className="shrink-0 transition-[filter] duration-200 group-[.is-active]:drop-shadow-[0_0_3px_oklch(0.65_0.15_250_/_40%)]">
								{item.icon}
							</span>
							{item.label}
							{item.to === "/rules" && ruleCount > 0 && (
								<span className="ml-auto text-xs text-muted-foreground">
									({ruleCount})
								</span>
							)}
						</Link>
					</motion.div>
				))}

				<motion.div
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					transition={{ duration: 0.3, delay: navItems.length * 0.04 }}
				>
					<div className="my-3 border-t border-sidebar-border mx-3" />
				</motion.div>

				<motion.div
					initial={{ opacity: 0, x: -8 }}
					animate={{ opacity: 1, x: 0 }}
					transition={{
						duration: 0.25,
						delay: (navItems.length + 1) * 0.04,
						ease: [0.22, 1, 0.36, 1],
					}}
				>
					<Link
						to="/transactions/unmatched"
						className={cn(baseLinkClass, "w-full text-left")}
						activeProps={{
							className: activeIndicatorClass,
						}}
						aria-label={`Unmatched transactions: ${unmatchedCount}`}
					>
						<span className="shrink-0 transition-[filter] duration-200 group-[.is-active]:drop-shadow-[0_0_3px_oklch(0.65_0.15_250_/_40%)]">
							<Inbox className="h-4 w-4" />
						</span>
						<span>Unmatched</span>
						<span
							className="ml-auto text-xs px-2 py-0.5 rounded-full bg-amber-500/20"
							aria-hidden="true"
						>
							<AnimatedCounter value={unmatchedCount} />
						</span>
					</Link>
				</motion.div>

				<motion.div
					initial={{ opacity: 0, x: -8 }}
					animate={{ opacity: 1, x: 0 }}
					transition={{
						duration: 0.25,
						delay: (navItems.length + 2) * 0.04,
						ease: [0.22, 1, 0.36, 1],
					}}
				>
					<button
						type="button"
						onClick={handleMonthClick}
						className={cn(
							baseLinkClass,
							"w-full text-left",
							activeFilters.has("month") && activeIndicatorClass,
						)}
						aria-label={`This month transactions: ${monthCount}`}
					>
						<span className="shrink-0 transition-[filter] duration-200 group-[.is-active]:drop-shadow-[0_0_3px_oklch(0.65_0.15_250_/_40%)]">
							<CalendarDays className="h-4 w-4" />
						</span>
						<span>This Month</span>
						<span
							className="ml-auto text-xs px-2 py-0.5 rounded-full bg-blue-500/20"
							aria-hidden="true"
						>
							<AnimatedCounter value={monthCount} />
						</span>
					</button>
				</motion.div>

				<motion.div
					initial={{ opacity: 0, x: -8 }}
					animate={{ opacity: 1, x: 0 }}
					transition={{
						duration: 0.25,
						delay: (navItems.length + 3) * 0.04,
						ease: [0.22, 1, 0.36, 1],
					}}
				>
					<button
						type="button"
						onClick={handleSubscriptionsClick}
						className={cn(
							baseLinkClass,
							"w-full text-left",
							activeFilters.has("subscriptions") && activeIndicatorClass,
						)}
						aria-label={`Subscriptions: ${subscriptionCount}`}
					>
						<span className="shrink-0 transition-[filter] duration-200 group-[.is-active]:drop-shadow-[0_0_3px_oklch(0.65_0.15_250_/_40%)]">
							<Repeat className="h-4 w-4" />
						</span>
						<span>Subscriptions</span>
						{subscriptionCount > 0 && (
							<span
								className="ml-auto text-xs px-2 py-0.5 rounded-full bg-purple-500/20"
								aria-hidden="true"
							>
								<AnimatedCounter value={subscriptionCount} />
							</span>
						)}
					</button>
				</motion.div>
			</nav>

			<div className="mt-auto pt-4 border-t border-sidebar-border">
				<p className="text-xs text-muted-foreground px-3 mb-2 font-medium uppercase tracking-wider">
					Stats
				</p>
				<div className="flex flex-col gap-1 px-3 text-sm text-muted-foreground">
					<div className="flex justify-between">
						<span>Unmatched</span>
						<span aria-live="polite">
							<AnimatedCounter value={unmatchedCount} />
						</span>
					</div>
					<div className="flex justify-between">
						<span>Merchants</span>
						<span>{merchantCount}</span>
					</div>
					<div className="flex justify-between">
						<span>Accounts</span>
						<span>{accountCount}</span>
					</div>
				</div>
			</div>
		</aside>
	);
}

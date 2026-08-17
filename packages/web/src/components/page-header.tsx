import type { ReactNode } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useSidebarCollapsedContext } from "@/lib/sidebar-collapsed-context";

/**
 * A page's title row, with the sidebar-reopen trigger as a flex sibling rather
 * than a separate bar above it — the same shape miel's `TopBar` left island
 * uses. The trigger only renders while the sidebar is collapsed; unlike the
 * previous floated version, this is normal flow, so it never overlaps the
 * heading it sits beside or shifts anything below it.
 */
export function PageHeader({ children }: { children: ReactNode }) {
	const { collapsed, toggle, triggerRef } = useSidebarCollapsedContext();

	return (
		<div className="flex items-center gap-3">
			{collapsed ? (
				<SidebarTrigger ref={triggerRef} onClick={toggle} />
			) : null}
			{children}
		</div>
	);
}

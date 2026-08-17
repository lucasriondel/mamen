import {
	createContext,
	type ReactNode,
	type RefObject,
	useContext,
} from "react";

export interface SidebarCollapsedContextValue {
	/** Whether the panel is collapsed — drives whether a page renders a trigger. */
	collapsed: boolean;
	/** Flip it — what a page's {@link PageHeader} trigger calls on click. */
	toggle: () => void;
	/** The trigger button each `PageHeader` renders while collapsed, so focus can
	 * be handed to whichever one mounts (there's at most one at a time). */
	triggerRef: RefObject<HTMLButtonElement | null>;
}

const SidebarCollapsedContext =
	createContext<SidebarCollapsedContextValue | null>(null);

export function SidebarCollapsedProvider({
	value,
	children,
}: {
	value: SidebarCollapsedContextValue;
	children: ReactNode;
}) {
	return (
		<SidebarCollapsedContext.Provider value={value}>
			{children}
		</SidebarCollapsedContext.Provider>
	);
}

/** Read the shell's collapse state — only valid inside {@link SidebarCollapsedProvider}. */
export function useSidebarCollapsedContext(): SidebarCollapsedContextValue {
	const value = useContext(SidebarCollapsedContext);
	if (!value) {
		throw new Error(
			"useSidebarCollapsedContext must be used within AppShell",
		);
	}
	return value;
}

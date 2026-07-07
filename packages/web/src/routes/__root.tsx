import { createRootRoute, Outlet } from "@tanstack/react-router";
import { CommandPalette } from "@/components/CommandPalette";
import { Layout } from "@/components/Layout";
import { Toaster } from "@/components/ui/sonner";
import { CommandPaletteProvider } from "@/context/CommandPaletteContext";
import { FocusModeProvider } from "@/context/FocusModeContext";

export const Route = createRootRoute({
	component: RootComponent,
});

function RootComponent(): React.ReactElement {
	return (
		<FocusModeProvider>
			<CommandPaletteProvider>
				<Layout>
					<Outlet />
				</Layout>
				<CommandPalette />
				<Toaster />
			</CommandPaletteProvider>
		</FocusModeProvider>
	);
}

import { createRootRoute, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import { CommandPalette } from "@/components/CommandPalette";
import { Layout } from "@/components/Layout";
import { Toaster } from "@/components/ui/sonner";
import { CommandPaletteProvider } from "@/context/CommandPaletteContext";
import { FocusModeProvider } from "@/context/FocusModeContext";
import { seedCategories } from "@/lib/seeds/categories";

export const Route = createRootRoute({
	component: RootComponent,
});

function RootComponent(): React.ReactElement {
	useEffect(() => {
		seedCategories().catch(console.error);
	}, []);

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

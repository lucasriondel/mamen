import { Breadcrumb } from "@/components/Breadcrumb";
import { useBreadcrumbNavigation } from "@/hooks/useBreadcrumbNavigation";
import { useBreadcrumbs } from "@/hooks/useBreadcrumbs";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";

type LayoutProps = {
	children: React.ReactNode;
};

export function Layout({ children }: LayoutProps): React.ReactElement {
	const segments = useBreadcrumbs();
	useBreadcrumbNavigation();

	return (
		<div className="flex h-screen bg-sidebar p-2 pl-0">
			<Sidebar />
			<div className="flex flex-1 flex-col rounded-2xl bg-background shadow-[0_0_24px_rgba(0,0,0,0.15),0_0_48px_rgba(0,0,0,0.1)] overflow-hidden">
				<Header />
				<main className="flex-1 overflow-auto p-6">
					<Breadcrumb segments={segments} className="mb-4" />
					{children}
				</main>
			</div>
		</div>
	);
}

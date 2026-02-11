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
		<div className="flex h-screen bg-sidebar">
			<Sidebar />
			<div className="flex flex-1 flex-col rounded-l-2xl bg-background shadow-[-2px_0_16px_rgba(0,0,0,0.2),-8px_0_40px_rgba(0,0,0,0.15)]">
				<Header />
				<main className="flex-1 overflow-auto p-6">
					<Breadcrumb segments={segments} className="mb-4" />
					{children}
				</main>
			</div>
		</div>
	);
}

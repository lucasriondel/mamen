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
		<div className="flex h-screen">
			<Sidebar />
			<div className="flex flex-1 flex-col">
				<Header />
				<main className="flex-1 overflow-auto p-6">
					<Breadcrumb segments={segments} className="mb-4" />
					{children}
				</main>
			</div>
		</div>
	);
}

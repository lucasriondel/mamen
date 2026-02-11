import { createFileRoute, Outlet, useMatch } from "@tanstack/react-router";
import { MerchantsPage } from "@/features/merchants/components/MerchantsPage";

export const Route = createFileRoute("/merchants")({
	component: MerchantsLayout,
});

function MerchantsLayout(): React.ReactElement {
	const childMatch = useMatch({
		from: "/merchants/$merchantId",
		shouldThrow: false,
	});

	if (childMatch) {
		return <Outlet />;
	}

	return <MerchantsPage />;
}

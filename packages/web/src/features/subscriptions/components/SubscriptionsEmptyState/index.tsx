import { Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFocusMode } from "@/context/FocusModeContext";

export function SubscriptionsEmptyState(): React.ReactElement {
	const { toggleFocusMode } = useFocusMode();

	const handleViewAll = (): void => {
		toggleFocusMode("all");
	};

	return (
		<div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
			<div className="text-muted-foreground">
				<Repeat className="w-12 h-12 mb-4 mx-auto opacity-50" />
				<h3 className="text-lg font-medium">No subscriptions detected yet</h3>
				<p className="text-sm mt-2">
					Import more statements to detect recurring charges
				</p>
			</div>
			<Button variant="outline" onClick={handleViewAll}>
				View All Transactions
			</Button>
		</div>
	);
}

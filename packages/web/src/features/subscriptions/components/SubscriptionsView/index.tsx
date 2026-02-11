import { useSubscriptions } from "../../hooks/useSubscriptions";
import { SubscriptionsEmptyState } from "../SubscriptionsEmptyState";
import { SubscriptionsList } from "../SubscriptionsList";
import { SubscriptionsSummary } from "../SubscriptionsSummary";

export function SubscriptionsView(): React.ReactElement {
	const { subscriptions, monthlyTotal, yearlyTotal, count, isLoading } =
		useSubscriptions();

	if (isLoading) {
		return (
			<div className="flex flex-col h-full">
				<div className="grid grid-cols-3 gap-4 px-4 py-4">
					{[0, 1, 2].map((i) => (
						<div
							key={i}
							className="h-24 rounded-xl border bg-muted/50 animate-pulse"
						/>
					))}
				</div>
				<div className="flex-1 px-4 space-y-2">
					{[0, 1, 2, 3].map((i) => (
						<div key={i} className="h-12 rounded bg-muted/50 animate-pulse" />
					))}
				</div>
				<span className="sr-only">Loading subscriptions...</span>
			</div>
		);
	}

	if (subscriptions.length === 0) {
		return <SubscriptionsEmptyState />;
	}

	return (
		<div className="flex flex-col h-full">
			<SubscriptionsSummary
				monthlyTotal={monthlyTotal}
				yearlyTotal={yearlyTotal}
				activeCount={count}
			/>
			<SubscriptionsList subscriptions={subscriptions} />
		</div>
	);
}

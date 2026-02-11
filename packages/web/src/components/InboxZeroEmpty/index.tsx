import { Link } from "@tanstack/react-router";
import { CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function InboxZeroEmpty(): React.ReactElement {
	return (
		<div
			role="status"
			className="flex flex-col items-center justify-center py-16 px-4"
		>
			<CheckCircle className="h-16 w-16 text-green-500 mb-4 animate-scale-in" />
			<h2 className="text-2xl font-semibold mb-2 animate-fade-in">
				All caught up!
			</h2>
			<p
				className="text-muted-foreground mb-6 animate-fade-in"
				style={{ animationDelay: "100ms" }}
			>
				Every transaction has a merchant.
			</p>
			<Button
				asChild
				className="animate-fade-in"
				style={{ animationDelay: "200ms" }}
			>
				<Link to="/">View Dashboard</Link>
			</Button>
		</div>
	);
}

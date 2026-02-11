import { ExternalLink } from "lucide-react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { APP_VERSION } from "@/lib/constants";

export function AboutSection(): React.ReactElement {
	return (
		<Card>
			<CardHeader>
				<CardTitle>About</CardTitle>
				<CardDescription>Application information</CardDescription>
			</CardHeader>
			<CardContent className="space-y-3">
				<div className="space-y-1">
					<p className="text-sm">
						<span className="text-muted-foreground">Version:</span>{" "}
						{APP_VERSION}
					</p>
					<p className="text-sm">
						<span className="text-muted-foreground">Build date:</span>{" "}
						{__BUILD_DATE__}
					</p>
				</div>
				<div className="space-y-2">
					<a
						href="https://github.com/mamen/docs"
						target="_blank"
						rel="noopener noreferrer"
						className="flex items-center gap-1.5 text-sm text-primary hover:underline"
					>
						<ExternalLink className="h-3.5 w-3.5" />
						Documentation
					</a>
					<a
						href="https://github.com/mamen/issues"
						target="_blank"
						rel="noopener noreferrer"
						className="flex items-center gap-1.5 text-sm text-primary hover:underline"
					>
						<ExternalLink className="h-3.5 w-3.5" />
						Report an issue
					</a>
				</div>
			</CardContent>
		</Card>
	);
}

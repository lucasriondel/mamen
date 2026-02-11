import { CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";

const cheatsheetItems = [
	{ pattern: ".*", description: "any characters" },
	{ pattern: "^ABC", description: "starts with ABC" },
	{ pattern: "XYZ$", description: "ends with XYZ" },
	{ pattern: "[0-9]+", description: "one or more digits" },
	{ pattern: "ABC|DEF", description: "matches ABC or DEF" },
	{ pattern: "\\.", description: "literal dot" },
	{ pattern: "\\*", description: "literal asterisk" },
];

export function RegexCheatsheet(): React.ReactElement {
	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="h-6 w-6"
					aria-label="Regex help"
				>
					<CircleHelp className="h-4 w-4" />
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-64" align="end">
				<div className="space-y-2">
					<h4 className="font-medium text-sm">Regex Patterns</h4>
					<div className="space-y-1">
						{cheatsheetItems.map((item) => (
							<div
								key={item.pattern}
								className="flex items-center gap-2 text-xs"
							>
								<code className="bg-muted px-1.5 py-0.5 rounded font-mono shrink-0">
									{item.pattern}
								</code>
								<span className="text-muted-foreground">
									{item.description}
								</span>
							</div>
						))}
					</div>
				</div>
			</PopoverContent>
		</Popover>
	);
}

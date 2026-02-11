import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { getIconComponent, ICON_LIST } from "../../lib/constants";

export type IconPickerProps = {
	value: string;
	onChange: (iconName: string) => void;
	className?: string;
};

export function IconPicker({
	value,
	onChange,
	className,
}: IconPickerProps): React.ReactElement {
	const [open, setOpen] = useState(false);
	const CurrentIcon = getIconComponent(value);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					size="sm"
					className={cn("gap-2", className)}
					type="button"
				>
					<CurrentIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
					<span className="text-xs">Icon</span>
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-auto p-3" align="start">
				<div
					className="grid grid-cols-8 gap-1.5 max-h-[200px] overflow-y-auto"
					role="radiogroup"
					aria-label="Select icon"
				>
					{ICON_LIST.map((iconName) => {
						const Icon = getIconComponent(iconName);
						return (
							// biome-ignore lint/a11y/useSemanticElements: button with role="radio" in a radiogroup is intentional for custom styled icon swatches
							<button
								key={iconName}
								type="button"
								role="radio"
								aria-checked={value === iconName}
								aria-label={iconName}
								className={cn(
									"flex items-center justify-center h-8 w-8 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
									value === iconName
										? "bg-accent text-accent-foreground"
										: "hover:bg-muted text-muted-foreground hover:text-foreground",
								)}
								onClick={() => {
									onChange(iconName);
									setOpen(false);
								}}
							>
								<Icon className="h-4 w-4" />
							</button>
						);
					})}
				</div>
			</PopoverContent>
		</Popover>
	);
}

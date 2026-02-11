import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { COLOR_PALETTE } from "../../lib/constants";

export type ColorPickerProps = {
	value: string;
	onChange: (color: string) => void;
	className?: string;
};

export function ColorPicker({
	value,
	onChange,
	className,
}: ColorPickerProps): React.ReactElement {
	const [open, setOpen] = useState(false);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					size="sm"
					className={cn("gap-2", className)}
					type="button"
				>
					<span
						className="h-4 w-4 rounded-full border shrink-0"
						style={{ backgroundColor: value }}
						aria-hidden="true"
					/>
					<span className="text-xs">Color</span>
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-auto p-3" align="start">
				<div
					className="grid grid-cols-4 gap-2"
					role="radiogroup"
					aria-label="Select color"
				>
					{COLOR_PALETTE.map((color) => (
						<button
							key={color}
							type="button"
							role="radio"
							aria-checked={value === color}
							aria-label={color}
							className={cn(
								"h-7 w-7 rounded-full border-2 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
								value === color
									? "border-foreground scale-110"
									: "border-transparent",
							)}
							style={{ backgroundColor: color }}
							onClick={() => {
								onChange(color);
								setOpen(false);
							}}
						/>
					))}
				</div>
			</PopoverContent>
		</Popover>
	);
}

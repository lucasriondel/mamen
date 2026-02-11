import { Tag } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { useCategories } from "@/hooks/useCategories";
import type { TransactionFilterValues } from "../../hooks/useTransactionFilters";

type CategoryFilterProps = {
	filterValues: TransactionFilterValues;
	onCategory: (categoryId?: number, subcategoryId?: number) => void;
	onClear: () => void;
};

export function CategoryFilter({
	filterValues,
	onCategory,
	onClear,
}: CategoryFilterProps) {
	const [open, setOpen] = useState(false);
	const { categoriesWithSubs, getCategoryById } = useCategories();

	const isActive = filterValues.categoryId != null;
	const activeName =
		filterValues.categoryId != null
			? getCategoryById(filterValues.categoryId)?.name
			: undefined;

	const handleSelect = (categoryId: number, subcategoryId?: number) => {
		onCategory(categoryId, subcategoryId);
		setOpen(false);
	};

	const handleClear = () => {
		onClear();
		setOpen(false);
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant={isActive ? "default" : "outline"}
					size="sm"
					className="h-8 gap-1.5 text-xs"
				>
					<Tag className="h-3.5 w-3.5" />
					{isActive && activeName ? activeName : "Category"}
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-64 p-0" align="start">
				<Command>
					<CommandInput placeholder="Search categories..." />
					<CommandList>
						<CommandEmpty>No categories found.</CommandEmpty>
						{categoriesWithSubs.map((parent) => (
							<CommandGroup key={parent.id} heading={parent.name}>
								<CommandItem
									onSelect={() => handleSelect(parent.id!)}
									className="flex items-center gap-2"
								>
									<span
										className="h-2 w-2 rounded-full shrink-0"
										style={{ backgroundColor: parent.color }}
									/>
									<span className="text-xs">All {parent.name}</span>
								</CommandItem>
								{parent.subcategories.map((sub) => (
									<CommandItem
										key={sub.id}
										onSelect={() => handleSelect(sub.id!)}
										className="flex items-center gap-2 pl-6"
									>
										<span
											className="h-2 w-2 rounded-full shrink-0"
											style={{ backgroundColor: parent.color }}
										/>
										<span className="text-xs">{sub.name}</span>
									</CommandItem>
								))}
							</CommandGroup>
						))}
					</CommandList>
				</Command>
				{isActive && (
					<div className="border-t p-2">
						<Button
							variant="ghost"
							size="sm"
							className="h-7 w-full text-xs"
							onClick={handleClear}
						>
							Clear
						</Button>
					</div>
				)}
			</PopoverContent>
		</Popover>
	);
}

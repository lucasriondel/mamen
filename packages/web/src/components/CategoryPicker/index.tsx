import { ArrowLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import { useCategories } from "@/hooks/useCategories";
import { cn } from "@/lib/utils";
import type { Category } from "@/types";

export type CategoryPickerProps = {
	value?: number;
	onSelect: (categoryId: number, subcategoryId?: number) => void;
	allowSubcategory?: boolean;
	className?: string;
};

export function CategoryPicker({
	value,
	onSelect,
	allowSubcategory = true,
	className,
}: CategoryPickerProps): React.ReactElement {
	const { parentCategories, getSubcategories } = useCategories();
	const [selectedParent, setSelectedParent] = useState<Category | null>(null);
	const [search, setSearch] = useState("");

	const subcategories = useMemo(
		() => (selectedParent?.id ? getSubcategories(selectedParent.id) : []),
		[selectedParent, getSubcategories],
	);

	const handleParentSelect = (category: Category): void => {
		if (allowSubcategory) {
			setSelectedParent(category);
			setSearch("");
		} else {
			onSelect(category.id!);
		}
	};

	const handleSubcategorySelect = (subcategory: Category): void => {
		onSelect(selectedParent!.id!, subcategory.id!);
		setSelectedParent(null);
		setSearch("");
	};

	const handleParentOnly = (): void => {
		if (selectedParent) {
			onSelect(selectedParent.id!);
			setSelectedParent(null);
			setSearch("");
		}
	};

	const handleBack = (): void => {
		setSelectedParent(null);
		setSearch("");
	};

	return (
		<Command
			className={cn("w-[280px]", className)}
			aria-label="Select category"
		>
			<CommandInput
				placeholder="Search categories..."
				value={search}
				onValueChange={setSearch}
				aria-label="Search categories"
			/>
			<CommandList className="max-h-[320px]">
				<CommandEmpty>No categories found.</CommandEmpty>

				{selectedParent ? (
					<CommandGroup heading={selectedParent.name}>
						<CommandItem onSelect={handleBack}>
							<ArrowLeft className="mr-2 h-4 w-4" />
							Back
						</CommandItem>
						<CommandItem onSelect={handleParentOnly}>
							<span
								className="mr-2 h-2 w-2 rounded-full shrink-0"
								style={{ backgroundColor: selectedParent.color }}
								aria-hidden="true"
							/>
							{selectedParent.name} (no subcategory)
						</CommandItem>
						{subcategories.map((sub) => (
							<CommandItem
								key={sub.id}
								value={sub.name}
								onSelect={() => handleSubcategorySelect(sub)}
								aria-selected={sub.id === value}
							>
								<span
									className="mr-2 h-2 w-2 rounded-full shrink-0"
									style={{ backgroundColor: sub.color }}
									aria-hidden="true"
								/>
								{sub.name}
							</CommandItem>
						))}
					</CommandGroup>
				) : (
					<CommandGroup heading="Categories">
						{parentCategories.map((category) => (
							<CommandItem
								key={category.id}
								value={category.name}
								onSelect={() => handleParentSelect(category)}
								aria-selected={category.id === value}
							>
								<span
									className="mr-2 h-2 w-2 rounded-full shrink-0"
									style={{ backgroundColor: category.color }}
									aria-hidden="true"
								/>
								{category.name}
								{allowSubcategory && (
									<ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
								)}
							</CommandItem>
						))}
					</CommandGroup>
				)}
			</CommandList>
		</Command>
	);
}

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
	const { parentCategories, categoriesWithSubs, getSubcategories } =
		useCategories();
	const [selectedParent, setSelectedParent] = useState<Category | null>(null);
	const [search, setSearch] = useState("");
	const isSearching = search.length > 0 && !selectedParent;

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
		if (!selectedParent?.id) return;
		onSelect(selectedParent.id, subcategory.id!);
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
				) : isSearching ? (
					categoriesWithSubs.map((parent) => (
						<CommandGroup key={parent.id} heading={parent.name}>
							<CommandItem
								value={`${parent.name} (general)`}
								onSelect={() => onSelect(parent.id!)}
							>
								<span
									className="mr-2 h-2 w-2 rounded-full shrink-0"
									style={{ backgroundColor: parent.color }}
									aria-hidden="true"
								/>
								{parent.name}
								<span className="text-muted-foreground text-xs ml-auto">
									General
								</span>
							</CommandItem>
							{parent.subcategories.map((sub) => (
								<CommandItem
									key={sub.id}
									value={`${parent.name} ${sub.name}`}
									onSelect={() => onSelect(parent.id!, sub.id!)}
									aria-selected={sub.id === value}
								>
									<span
										className="mr-2 h-2 w-2 rounded-full shrink-0"
										style={{ backgroundColor: sub.color }}
										aria-hidden="true"
									/>
									<span className="text-muted-foreground">{parent.name}</span>
									<ChevronRight className="h-3 w-3 text-muted-foreground" />
									{sub.name}
								</CommandItem>
							))}
						</CommandGroup>
					))
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

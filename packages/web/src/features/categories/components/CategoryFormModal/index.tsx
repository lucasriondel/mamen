import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { CategoryPicker } from "@/components/CategoryPicker";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { useCategories } from "@/hooks/useCategories";
import { type UpdateCategoryInput, updateCategorySchema } from "@/lib/schemas";
import type { CategoryTreeNode } from "@/types";
import { DEFAULT_COLOR, DEFAULT_ICON } from "../../lib/constants";
import { ColorPicker } from "../ColorPicker";
import { IconPicker } from "../IconPicker";

type CategoryFormModalProps = {
	mode: "create" | "edit";
	open: boolean;
	onOpenChange: (open: boolean) => void;
	parentId: number | null;
	editNode?: CategoryTreeNode | null;
	defaultName?: string;
	onCreate: (params: {
		name: string;
		parentId: number | null;
		color?: string;
		icon?: string;
	}) => Promise<number>;
	onUpdate: (id: number, updates: UpdateCategoryInput) => Promise<void>;
};

export function CategoryFormModal({
	mode,
	open,
	onOpenChange,
	parentId,
	editNode,
	defaultName,
	onCreate,
	onUpdate,
}: CategoryFormModalProps): React.ReactElement {
	const { getCategoryById } = useCategories();
	const [selectedParentId, setSelectedParentId] = useState<number | null>(
		parentId,
	);
	const [parentPickerOpen, setParentPickerOpen] = useState(false);

	const selectedParentCategory = selectedParentId
		? getCategoryById(selectedParentId)
		: null;

	const form = useForm<UpdateCategoryInput>({
		resolver: zodResolver(updateCategorySchema),
		defaultValues: {
			name: "",
			color: DEFAULT_COLOR,
			icon: DEFAULT_ICON,
		},
	});

	useEffect(() => {
		if (mode === "edit" && editNode) {
			form.reset({
				name: editNode.name,
				color: editNode.color,
				icon: editNode.icon,
			});
		} else if (mode === "create") {
			form.reset({
				name: defaultName ?? "",
				color: DEFAULT_COLOR,
				icon: DEFAULT_ICON,
			});
			setSelectedParentId(parentId);
		}
	}, [mode, editNode, parentId, defaultName, form]);

	const handleSubmit = async (data: UpdateCategoryInput): Promise<void> => {
		if (mode === "edit" && editNode?.id) {
			await onUpdate(editNode.id, data);
			toast.success("Category updated", {
				description: `"${data.name}" has been updated.`,
			});
		} else {
			await onCreate({
				name: data.name,
				parentId: selectedParentId,
				color: data.color,
				icon: data.icon,
			});
			toast.success("Category created", {
				description: `"${data.name}" has been added.`,
			});
		}
		form.reset();
		onOpenChange(false);
	};

	const handleOpenChange = (nextOpen: boolean): void => {
		if (!nextOpen) {
			form.reset();
		}
		onOpenChange(nextOpen);
	};

	const isEdit = mode === "edit";

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-[480px]">
				<DialogHeader>
					<DialogTitle>{isEdit ? "Edit Category" : "Add Category"}</DialogTitle>
					<DialogDescription>
						{isEdit
							? "Update the category details."
							: selectedParentId !== null
								? "Add a new subcategory."
								: "Add a new root category."}
					</DialogDescription>
				</DialogHeader>
				<Form {...form}>
					<form
						onSubmit={form.handleSubmit(handleSubmit)}
						className="space-y-4"
					>
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Name</FormLabel>
									<FormControl>
										<Input placeholder="e.g. Groceries" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						{!isEdit && (
							<div className="space-y-2">
								<FormLabel>Parent category</FormLabel>
								<Popover
									open={parentPickerOpen}
									onOpenChange={setParentPickerOpen}
								>
									<PopoverTrigger asChild>
										<Button
											variant="outline"
											className="w-full justify-between"
											type="button"
										>
											{selectedParentCategory ? (
												<span className="flex items-center gap-2">
													<span
														className="h-2 w-2 rounded-full shrink-0"
														style={{
															backgroundColor: selectedParentCategory.color,
														}}
														aria-hidden="true"
													/>
													{selectedParentCategory.name}
												</span>
											) : (
												<span className="text-muted-foreground">
													Root level (no parent)
												</span>
											)}
											<ChevronDown className="h-4 w-4 opacity-50" />
										</Button>
									</PopoverTrigger>
									<PopoverContent className="w-[280px] p-0" align="start">
										<CategoryPicker
											value={selectedParentId ?? undefined}
											onSelect={(categoryId) => {
												setSelectedParentId(categoryId);
												setParentPickerOpen(false);
											}}
											allowSubcategory={false}
											allowCreate={false}
										/>
									</PopoverContent>
								</Popover>
								{selectedParentId !== null && (
									<button
										type="button"
										className="text-xs text-muted-foreground hover:text-foreground underline"
										onClick={() => setSelectedParentId(null)}
									>
										Remove parent
									</button>
								)}
							</div>
						)}
						<div className="flex gap-2">
							<FormField
								control={form.control}
								name="color"
								render={({ field }) => (
									<FormItem>
										<FormControl>
											<ColorPicker
												value={field.value}
												onChange={field.onChange}
											/>
										</FormControl>
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="icon"
								render={({ field }) => (
									<FormItem>
										<FormControl>
											<IconPicker
												value={field.value}
												onChange={field.onChange}
											/>
										</FormControl>
									</FormItem>
								)}
							/>
						</div>
						<DialogFooter>
							<Button
								type="button"
								variant="ghost"
								onClick={() => handleOpenChange(false)}
							>
								Cancel
							</Button>
							<Button type="submit">
								{isEdit ? "Save Changes" : "Add Category"}
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}

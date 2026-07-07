import { Camera, ChevronDown, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CategoryPicker } from "@/components/CategoryPicker";
import { MerchantAvatar } from "@/components/MerchantAvatar";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { useCategories } from "@/hooks/useCategories";
import { invalidateEntity, merchantsApi } from "@/lib/api";

export type EditMerchantModalProps = {
	isOpen: boolean;
	onClose: () => void;
	merchantId: number;
	currentName: string;
	currentCategoryId: number | undefined;
	currentImageUrl?: string;
};

export function EditMerchantModal({
	isOpen,
	onClose,
	merchantId,
	currentName,
	currentCategoryId,
	currentImageUrl,
}: EditMerchantModalProps): React.ReactElement {
	const [name, setName] = useState("");
	const [categoryId, setCategoryId] = useState<number | undefined>(undefined);
	const [isSaving, setIsSaving] = useState(false);
	const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
	const [imageFile, setImageFile] = useState<File | null>(null);
	const [imagePreview, setImagePreview] = useState<string | null>(null);
	const [removeImage, setRemoveImage] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const { getCategoryById } = useCategories();

	useEffect(() => {
		if (isOpen) {
			setName(currentName);
			setCategoryId(currentCategoryId);
			setImageFile(null);
			setImagePreview(null);
			setRemoveImage(false);
		}
	}, [isOpen, currentName, currentCategoryId]);

	const handleImageSelect = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0];
			if (!file) return;
			setImageFile(file);
			setRemoveImage(false);
			const url = URL.createObjectURL(file);
			setImagePreview(url);
		},
		[],
	);

	useEffect(() => {
		return () => {
			if (imagePreview) URL.revokeObjectURL(imagePreview);
		};
	}, [imagePreview]);

	const hasImageChange =
		imageFile !== null || (removeImage && currentImageUrl != null);
	const hasChanges =
		name !== currentName || categoryId !== currentCategoryId || hasImageChange;
	const canSave = name.trim().length > 0 && hasChanges && !isSaving;

	const handleSave = async (): Promise<void> => {
		if (!canSave) return;
		setIsSaving(true);
		try {
			if (imageFile) {
				await merchantsApi.uploadImage(merchantId, imageFile);
			} else if (removeImage) {
				await merchantsApi.deleteImage(merchantId);
			}

			const hasMetadataChanges =
				name !== currentName || categoryId !== currentCategoryId;
			if (hasMetadataChanges) {
				await merchantsApi.update(merchantId, {
					name: name.trim(),
					defaultCategoryId: categoryId,
				});
			}

			invalidateEntity("merchants");
			toast("Merchant updated");
			onClose();
		} catch {
			toast.error("Failed to update merchant");
		} finally {
			setIsSaving(false);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent): void => {
		if (e.key === "Enter" && canSave) {
			e.preventDefault();
			handleSave();
		}
	};

	const selectedCategory =
		categoryId !== undefined ? getCategoryById(categoryId) : undefined;

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="sm:max-w-[400px]" onKeyDown={handleKeyDown}>
				<DialogHeader>
					<DialogTitle>Edit Merchant</DialogTitle>
					<DialogDescription>
						Update merchant name and default category
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 py-2">
					<div className="flex items-center gap-4">
						<div className="relative group">
							<button
								type="button"
								onClick={() => fileInputRef.current?.click()}
								className="relative rounded-full overflow-hidden cursor-pointer"
							>
								{imagePreview ? (
									<img
										src={imagePreview}
										alt="Preview"
										className="size-12 rounded-full object-cover"
									/>
								) : !removeImage && currentImageUrl ? (
									<img
										src={currentImageUrl}
										alt={currentName}
										className="size-12 rounded-full object-cover"
									/>
								) : (
									<MerchantAvatar name={name || currentName} size="lg" />
								)}
								<div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-full">
									<Camera className="h-4 w-4 text-white" />
								</div>
							</button>
							{(imagePreview || (!removeImage && currentImageUrl)) && (
								<button
									type="button"
									onClick={() => {
										setImageFile(null);
										setImagePreview(null);
										setRemoveImage(true);
									}}
									className="absolute -top-1 -right-1 size-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
									aria-label="Remove image"
								>
									<X className="h-3 w-3" />
								</button>
							)}
						</div>
						<input
							ref={fileInputRef}
							type="file"
							accept="image/jpeg,image/png,image/webp,image/gif"
							onChange={handleImageSelect}
							className="hidden"
						/>
						<div className="flex-1 space-y-2">
							<Label htmlFor="merchant-name">Name</Label>
							<Input
								id="merchant-name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								placeholder="Merchant name"
								autoFocus
							/>
						</div>
					</div>

					<div className="space-y-2">
						<Label>Default Category</Label>
						<Popover
							open={categoryPickerOpen}
							onOpenChange={setCategoryPickerOpen}
						>
							<PopoverTrigger asChild>
								<Button
									variant="outline"
									className="w-full justify-between"
									role="combobox"
									aria-expanded={categoryPickerOpen}
								>
									{selectedCategory ? (
										<span className="flex items-center gap-2">
											<span
												className="h-2 w-2 rounded-full shrink-0"
												style={{
													backgroundColor: selectedCategory.color,
												}}
											/>
											{selectedCategory.name}
										</span>
									) : (
										<span className="text-muted-foreground">No category</span>
									)}
									<ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
								</Button>
							</PopoverTrigger>
							<PopoverContent className="p-0" align="start">
								<CategoryPicker
									value={categoryId}
									onSelect={(catId, subId) => {
										setCategoryId(subId ?? catId);
										setCategoryPickerOpen(false);
									}}
								/>
							</PopoverContent>
						</Popover>
					</div>
				</div>

				<DialogFooter>
					<Button variant="outline" onClick={onClose}>
						Cancel
					</Button>
					<Button onClick={handleSave} disabled={!canSave}>
						{isSaving ? "Saving..." : "Save"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

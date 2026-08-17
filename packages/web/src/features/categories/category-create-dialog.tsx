import type { Category, CategoryId } from "@mamen/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { AppearancePicker } from "@/components/appearance-picker";
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
import {
	NEUTRAL_CATEGORY_COLOR,
	resolveCategoryColor,
} from "@/lib/category-tree";
import { categoryQueries } from "@/lib/sdk";
import { CategoryParentPicker } from "./category-parent-picker";
import { useCategoryMutations } from "./use-category-mutations";

/** The default **Icon name** a new category starts on (ADR 0006 / issue #32). */
const DEFAULT_ICON = "tag";

/**
 * Create a category **from wherever you are** — a self-contained modal owning
 * its own tree fetch and its own `create` mutation, so a surface that merely
 * *picks* a category can also mint one without growing taxonomy plumbing of its
 * own. Today that surface is the {@link CategoryLeafPicker}'s "Create …" row:
 * you search for a category that doesn't exist yet, and the dead end becomes the
 * gesture that makes it (rather than sending you to the categories page and
 * losing the issuer you were editing).
 *
 * Three fields, matching the categories page's own vocabulary: the **name**
 * (prefilled with whatever was typed into the search, since that is already the
 * user's intent), the **parent** (`null` = a new root — the same path-labelled
 * select the move flow uses), and the **appearance** — the same merged
 * {@link AppearancePicker} the category rows edit through (issue #130).
 *
 * The appearance still *defaults* to inheriting: the trigger shows the icon
 * painting the parent it would land under, and the editor opens on an empty
 * draft, so a category created without touching the colour is born with `null`
 * exactly as before (ADR 0006). What changed is that a user who does want a
 * colour up front no longer has to create the row and then edit it — and that
 * choosing an appearance means the same thing on both paths, which is the whole
 * point of merging the two editors.
 *
 * On success it reports the created row through `onCreated`, which is what lets
 * the caller select it immediately — the whole point of creating it here. A
 * refused write (a name clash, a **Kind flip** onto a money-holding parent)
 * surfaces as a toast from the mutation hook and leaves the dialog open with the
 * draft intact. Spill is *not* offered here: reshaping a money-holding node is
 * taxonomy surgery that belongs on the categories page, so the refusal simply
 * asks for a different parent.
 */
export function CategoryCreateDialog({
	open,
	onOpenChange,
	initialName = "",
	initialParentId = null,
	onCreated,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Prefills the name — the search text that found nothing. */
	initialName?: string;
	/** Preselects the parent, e.g. the folder the picker was browsing. */
	initialParentId?: CategoryId | null;
	/** The created category, so the caller can select it straight away. */
	onCreated?: (category: Category) => void;
}) {
	const categoriesQuery = useQuery(
		categoryQueries.list({ limit: 200, orderBy: "sortOrder" }),
	);
	const categories = (categoriesQuery.data?.items ?? []) as readonly Category[];

	const { create } = useCategoryMutations();

	const [name, setName] = useState(initialName);
	const [parentId, setParentId] = useState<CategoryId | null>(initialParentId);
	const [icon, setIcon] = useState(DEFAULT_ICON);
	/** The colour chosen up front; `null` — the default — means it inherits. */
	const [color, setColor] = useState<string | null>(null);
	/**
	 * The dialog's own node, handed to the pickers inside it so their popovers
	 * portal *within* the modal rather than to `document.body`. A modal dialog
	 * neutralises the document behind it — Radix trapped the wheel outside its own
	 * subtree, so a body-portalled popover rendered and clicked fine but its list
	 * could not be scrolled; Base UI locks the page in CSS and marks the outside
	 * inert instead. Portalling into the panel is what keeps the list usable under
	 * either. `useState` rather than `useRef` so the node is available on the
	 * render after mount.
	 */
	const [dialogNode, setDialogNode] = useState<HTMLDivElement | null>(null);

	// The dialog is remounted per opening (see the caller's `key`), so the drafts
	// seed from props once and never need to be synced back to them.
	const trimmed = name.trim();

	// Preview the icon in the colour the new node will actually paint: it inherits
	// from the selected parent, so changing the parent repaints the chip. A new
	// root has no ancestor to inherit from and shows the neutral constant.
	const parentCategory =
		parentId === null ? undefined : categories.find((c) => c.id === parentId);
	const previewColor = parentCategory
		? resolveCategoryColor(categories, parentCategory)
		: NEUTRAL_CATEGORY_COLOR;

	const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (trimmed.length === 0 || create.isPending) return;
		create.mutate(
			{ name: trimmed, parentId, icon, color },
			{
				onSuccess: (category) => {
					onCreated?.(category);
					onOpenChange(false);
				},
			},
		);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent ref={setDialogNode}>
				<form onSubmit={handleSubmit} className="flex flex-col gap-4">
					<DialogHeader>
						<DialogTitle>New category</DialogTitle>
						<DialogDescription>
							Name it, choose where it sits, and give it an icon and a colour.
							Leave the colour alone and it is inherited from the category above
							it.
						</DialogDescription>
					</DialogHeader>

					<div className="flex items-end gap-2">
						<label className="flex min-w-0 flex-1 flex-col gap-1 text-gousse-muted text-sm">
							Name
							<Input
								value={name}
								onChange={(e) => setName(e.target.value)}
								aria-label="Category name"
								// The name is the one field that is never right by default —
								// the prefill is a guess at the user's own words.
								autoFocus
							/>
						</label>
						{/* The appearance editor sits on the thing it describes, the same
						    gesture as the categories page: click the glyph to change how the
						    category looks. The same control on both paths, so choosing an
						    appearance means one thing (issue #130). */}
						<AppearancePicker
							label={trimmed.length > 0 ? trimmed : "new category"}
							icon={icon}
							color={color}
							// Nothing chosen yet resolves to the parent it would land under,
							// so changing the parent repaints the chip.
							resolved={color ?? previewColor}
							onSubmit={(appearance) => {
								setIcon(appearance.icon);
								setColor(appearance.color);
							}}
							className="mb-2"
							portalContainer={dialogNode}
						/>
					</div>

					<CategoryParentPicker
						categories={categories}
						value={parentId}
						onChange={setParentId}
						disabled={categoriesQuery.isPending}
						portalContainer={dialogNode}
					/>

					<DialogFooter>
						<Button
							variant="secondary"
							type="button"
							onClick={() => onOpenChange(false)}
						>
							Cancel
						</Button>
						<Button
							variant="primary"
							type="submit"
							disabled={create.isPending || trimmed.length === 0}
						>
							Create category
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

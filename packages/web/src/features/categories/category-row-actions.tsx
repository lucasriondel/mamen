import type { Category } from "@mamen/shared/contract";
import {
	CornerDownRight,
	EllipsisVertical,
	Move,
	Pencil,
	Plus,
	Trash2,
} from "lucide-react";
import {
	Menu,
	MenuContent,
	MenuGroup,
	MenuGroupLabel,
	MenuItem,
	MenuSeparator,
	MenuTrigger,
} from "@/components/ui/menu";

export interface CategoryRowActionsProps {
	node: Category;
	onAdd: (parent: Category) => void;
	onRename: (node: Category) => void;
	onMove: (node: Category) => void;
	onDelete: (node: Category) => void;
	/** A delete is in flight — the item stays rendered but won't fire twice. */
	deleting: boolean;
}

/**
 * The per-node curation actions. Four equal `secondary` buttons per row used to
 * live here — with a leaf, a folder and a root each carrying its own set, a
 * fifteen-category tree painted sixty buttons, and the chrome outweighed the
 * data it was wrapped around.
 *
 * The split is by **frequency, not by kind**. *Add* is the gesture this page
 * exists for — it is how the tree gets its shape — so it stays a one-click icon
 * button. Rename, move and delete are occasional, so they move behind a `⋯`
 * menu, where the destructive one can sit last, tinted, behind a separator,
 * rather than one pixel from Move.
 *
 * Every action keeps the accessible name it had (`Rename Food`, `Delete Food`),
 * so a caller — or a test — still asks for the node by name; what changed is
 * that the name now resolves inside a menu, one `⋯` click away.
 *
 * The visual hiding lives on the row (see `CategoryRow`): `.actions` reveals on
 * hover *and* `:focus-within`, and coarse pointers get it permanently. Nothing
 * here is conditional on hover, so keyboard and touch reach the same two
 * controls a mouse does.
 */
export function CategoryRowActions({
	node,
	onAdd,
	onRename,
	onMove,
	onDelete,
	deleting,
}: CategoryRowActionsProps) {
	return (
		<div className="flex shrink-0 items-center gap-0.5">
			{/* Adding a child under a childless leaf is a **Kind flip**: it turns the
			    leaf into a folder. Refused while the leaf holds money — the view
			    answers with the Spill dialog (issue #30) — so this is never disabled;
			    the refusal is a step, not a dead end. */}
			<button
				type="button"
				onClick={() => onAdd(node)}
				aria-label={`Add category in ${node.name}`}
				title={`Add category in ${node.name}`}
				className="flex size-7 shrink-0 items-center justify-center rounded-full text-gousse-muted outline-none transition-colors hover:bg-gousse-line/60 hover:text-gousse-ink focus-visible:ring-2 focus-visible:ring-gousse-accent"
			>
				<Plus className="size-4" aria-hidden />
			</button>

			<Menu>
				<MenuTrigger
					render={
						<button
							type="button"
							aria-label={`More actions for ${node.name}`}
							title={`More actions for ${node.name}`}
							className="flex size-7 shrink-0 items-center justify-center rounded-full text-gousse-muted outline-none transition-colors hover:bg-gousse-line/60 hover:text-gousse-ink focus-visible:ring-2 focus-visible:ring-gousse-accent data-[popup-open]:bg-gousse-line/60 data-[popup-open]:text-gousse-ink"
						>
							<EllipsisVertical className="size-4" aria-hidden />
						</button>
					}
				/>
				<MenuContent>
					<MenuGroup>
						<MenuItem onClick={() => onRename(node)}>
							<Pencil className="size-3.5 text-gousse-muted" aria-hidden />
							Rename {node.name}
						</MenuItem>
						<MenuItem onClick={() => onMove(node)}>
							<Move className="size-3.5 text-gousse-muted" aria-hidden />
							Move {node.name}
						</MenuItem>
						<MenuItem onClick={() => onAdd(node)}>
							<CornerDownRight
								className="size-3.5 text-gousse-muted"
								aria-hidden
							/>
							Add category in {node.name}
						</MenuItem>
					</MenuGroup>

					<MenuSeparator />

					<MenuGroup>
						<MenuGroupLabel>Danger zone</MenuGroupLabel>
						{/* Not guarded by a confirm: the API refuses while anything still
						    depends on the category and its `CategoryInUse` toast *names* the
						    dependents, which says more than "are you sure?" ever could. */}
						<MenuItem danger disabled={deleting} onClick={() => onDelete(node)}>
							<Trash2 className="size-3.5" aria-hidden />
							Delete {node.name}
						</MenuItem>
					</MenuGroup>
				</MenuContent>
			</Menu>
		</div>
	);
}

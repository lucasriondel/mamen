import type { Issuer } from "@mamen/shared/contract";
import { MAX_IMAGE_BYTES } from "@mamen/shared/contract";
import { type FormEvent, useRef, useState } from "react";
import { toast } from "sonner";
import {
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { RulesSection } from "@/features/rules/rules-section";
import { IssuerAvatar } from "./issuer-avatar";
import { useIssuerMutations } from "./use-issuer-mutations";

const INPUT_CLASS =
	"rounded-md border border-line bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-accent";
const BUTTON_CLASS =
	"rounded-md border border-line px-3 py-1.5 text-sm text-ink disabled:opacity-50";

export interface IssuerEditDialogProps {
	issuer: Issuer;
	/** How many transactions reference this issuer — deletion is blocked when > 0. */
	transactionCount: number;
	/** Called after a successful delete (to close the dialog). */
	onDone: () => void;
}

/**
 * The issuer **edit dialog** (PRD): rename, upload/remove the avatar image, and
 * a guarded delete — rendered as a dialog over the grid, not a route change.
 *
 * The 2 MiB image cap is pre-checked here for an instant, specific message (the
 * contract's multipart parser also enforces it server-side). Deletion is blocked
 * while transactions still reference the issuer, so no row is left pointing at a
 * deleted issuer; the button is disabled with an explanation. Mutations own
 * their invalidation and toast on failure ({@link useIssuerMutations}).
 */
export function IssuerEditDialog({
	issuer,
	transactionCount,
	onDone,
}: IssuerEditDialogProps) {
	const { rename, uploadImage, deleteImage, remove } = useIssuerMutations();
	const [draftName, setDraftName] = useState(issuer.name);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const hasTransactions = transactionCount > 0;

	const handleRename = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const trimmed = draftName.trim();
		if (trimmed.length === 0 || trimmed === issuer.name || rename.isPending) {
			return;
		}
		rename.mutate({ id: issuer.id, patch: { name: trimmed } });
	};

	const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		event.target.value = ""; // allow re-selecting the same file later
		if (!file) return;
		if (file.size > MAX_IMAGE_BYTES) {
			toast.error("That image is too large — the limit is 2 MiB.");
			return;
		}
		uploadImage.mutate({ id: issuer.id, file });
	};

	const handleDelete = () => {
		// Guard: never leave transactions pointing at a deleted issuer.
		if (hasTransactions || remove.isPending) return;
		remove.mutate(issuer.id, { onSuccess: onDone });
	};

	return (
		<DialogContent>
			<DialogHeader>
				<DialogTitle>Edit issuer</DialogTitle>
				<DialogDescription>
					Rename this issuer or change its avatar.
				</DialogDescription>
			</DialogHeader>

			<div className="flex items-center gap-4">
				<IssuerAvatar name={issuer.name} imageUrl={issuer.imageUrl} size="lg" />
				<div className="flex flex-wrap gap-2">
					<button
						type="button"
						className={BUTTON_CLASS}
						onClick={() => fileInputRef.current?.click()}
						disabled={uploadImage.isPending}
					>
						Upload image
					</button>
					<button
						type="button"
						className={BUTTON_CLASS}
						onClick={() => deleteImage.mutate(issuer.id)}
						disabled={issuer.imageUrl == null || deleteImage.isPending}
					>
						Remove image
					</button>
					<input
						ref={fileInputRef}
						type="file"
						accept="image/*"
						className="hidden"
						aria-label="Issuer image"
						onChange={handleFile}
					/>
				</div>
			</div>

			<form onSubmit={handleRename} className="flex items-end gap-2">
				<label className="flex flex-1 flex-col gap-1 text-sm text-muted">
					Name
					<input
						className={INPUT_CLASS}
						value={draftName}
						onChange={(event) => setDraftName(event.target.value)}
						aria-label="Issuer name"
					/>
				</label>
				<button
					type="submit"
					className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-bg disabled:opacity-50"
					disabled={rename.isPending || draftName.trim().length === 0}
				>
					Save
				</button>
			</form>

			<div className="border-t border-line pt-4">
				<RulesSection issuer={issuer} />
			</div>

			<DialogFooter>
				<div className="flex w-full flex-col gap-1 sm:items-start">
					<button
						type="button"
						className="self-start rounded-md border border-high px-3 py-1.5 text-sm text-high disabled:opacity-50"
						onClick={handleDelete}
						disabled={hasTransactions || remove.isPending}
						title={
							hasTransactions
								? "This issuer is still referenced by transactions"
								: undefined
						}
					>
						Delete issuer
					</button>
					{hasTransactions ? (
						<span className="text-xs text-muted">
							{transactionCount} transaction
							{transactionCount === 1 ? "" : "s"} reference this issuer —
							reassign them to delete.
						</span>
					) : null}
				</div>
			</DialogFooter>
		</DialogContent>
	);
}

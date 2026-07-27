import type { Issuer, IssuerId, Transaction } from "@mamen/shared/contract";
import { MAX_IMAGE_BYTES } from "@mamen/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { type FormEvent, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { RulesSection } from "@/features/rules/rules-section";
import { formatCurrency, formatShortDate } from "@/lib/format";
import { issuerQueries, transactionQueries } from "@/lib/sdk";
import { cn } from "@/lib/utils";
import { BUTTON_CLASS } from "./field-styles";
import { IssuerAvatar } from "./issuer-avatar";
import { IssuerDefaultCategoryPicker } from "./issuer-default-category-picker";
import { useIssuerMutations } from "./use-issuer-mutations";

/**
 * How many of an issuer's transactions to scan for the count + net total and the
 * list below. The contract has no per-issuer sum endpoint, so both are derived
 * client-side; per-issuer counts are small (PRD), so one wide page is enough.
 */
const ISSUER_TXN_SCAN_LIMIT = 1000;

const routeApi = getRouteApi("/issuers/$issuerId");

/**
 * The issuer **detail page** (PRD #8: single issuer surface) at
 * `/issuers/$issuerId`. Absorbs everything the old `IssuerEditDialog` did — the
 * header with avatar upload/remove, rename, and the guarded delete — and adds
 * the issuer's transactions list (count + net €) and its Matching Rules.
 *
 * This outer component owns the async reads (issuer + transactions) and the
 * loading / not-found states; once the issuer resolves it renders
 * {@link IssuerDetailContent}, which seeds the rename field from the loaded name.
 */
export function IssuerDetailPage() {
	const { issuerId } = routeApi.useParams();
	const id = Number(issuerId) as IssuerId;

	const issuerQuery = useQuery(issuerQueries.getById(id));
	const txnsQuery = useQuery(
		transactionQueries.list({ issuerId: id, limit: ISSUER_TXN_SCAN_LIMIT }),
	);

	if (issuerQuery.isPending) {
		return (
			<p className="py-16 text-center text-gousse-muted">Loading issuer…</p>
		);
	}

	const issuer = issuerQuery.data as Issuer | undefined;
	if (issuerQuery.isError || issuer == null) {
		return (
			<Empty
				title="Couldn't load this issuer"
				description="It may have been deleted, or something went wrong. Head back to the grid."
			>
				<Link to="/issuers" className={cn(BUTTON_CLASS, "mt-2")}>
					Back to issuers
				</Link>
			</Empty>
		);
	}

	const transactions = (txnsQuery.data?.items ?? []) as readonly Transaction[];
	const count = txnsQuery.data?.total ?? 0;

	return (
		<IssuerDetailContent
			issuer={issuer}
			transactions={transactions}
			count={count}
		/>
	);
}

interface IssuerDetailContentProps {
	issuer: Issuer;
	transactions: readonly Transaction[];
	/** How many transactions reference this issuer — deletion is blocked when > 0. */
	count: number;
}

/**
 * The resolved detail surface. Split out so the rename field can seed its state
 * from the loaded issuer name (`useState(issuer.name)`).
 *
 * Deletion stays blocked while transactions reference the issuer (the button is
 * disabled with the existing explanation), so no row is ever left pointing at a
 * deleted issuer; a successful delete navigates back to the issuers grid. The
 * 2 MiB image cap is pre-checked here for an instant message (the contract's
 * multipart parser also enforces it server-side).
 */
function IssuerDetailContent({
	issuer,
	transactions,
	count,
}: IssuerDetailContentProps) {
	const navigate = useNavigate();
	const { rename, uploadImage, deleteImage, remove } = useIssuerMutations();
	const [draftName, setDraftName] = useState(issuer.name);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const net = transactions.reduce((sum, txn) => sum + txn.amount, 0);
	const hasTransactions = count > 0;

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
		remove.mutate(issuer.id, {
			onSuccess: () => navigate({ to: "/issuers" }),
		});
	};

	return (
		<section className="flex flex-col gap-8">
			<Link
				to="/issuers"
				className="flex items-center gap-1 self-start text-sm text-gousse-muted transition-colors hover:text-gousse-ink"
			>
				<ArrowLeft size={16} aria-hidden />
				Issuers
			</Link>

			<header className="flex items-center gap-4">
				<IssuerAvatar name={issuer.name} imageUrl={issuer.imageUrl} size="lg" />
				<div className="flex min-w-0 flex-col">
					<h1 className="truncate text-balance text-2xl font-semibold text-gousse-ink">
						{issuer.name}
					</h1>
					<div className="flex items-baseline gap-2 text-sm">
						<span className="text-gousse-muted tabular-nums">
							{count} transaction{count === 1 ? "" : "s"}
						</span>
						<span
							className={cn(
								"font-medium tabular-nums",
								net < 0 && "text-gousse-high",
								net > 0 && "text-gousse-low",
							)}
						>
							{formatCurrency(net)}
						</span>
					</div>
				</div>
			</header>

			<div className="flex flex-wrap gap-2">
				<Button
					variant="secondary"
					size="sm"
					onClick={() => fileInputRef.current?.click()}
					disabled={uploadImage.isPending}
				>
					Upload image
				</Button>
				<Button
					variant="secondary"
					size="sm"
					onClick={() => deleteImage.mutate(issuer.id)}
					disabled={issuer.imageUrl == null || deleteImage.isPending}
				>
					Remove image
				</Button>
				<input
					ref={fileInputRef}
					type="file"
					accept="image/*"
					className="hidden"
					aria-label="Issuer image"
					onChange={handleFile}
				/>
			</div>

			<form onSubmit={handleRename} className="flex max-w-md items-end gap-2">
				<label className="flex flex-1 flex-col gap-1 text-sm text-gousse-muted">
					Name
					<Input
						value={draftName}
						onChange={(event) => setDraftName(event.target.value)}
						aria-label="Issuer name"
					/>
				</label>
				<Button
					type="submit"
					disabled={rename.isPending || draftName.trim().length === 0}
				>
					Save
				</Button>
			</form>

			<IssuerDefaultCategoryPicker issuer={issuer} />

			<div className="flex flex-col gap-3">
				<h2 className="text-balance text-lg font-semibold text-gousse-ink">
					Transactions
				</h2>
				{transactions.length === 0 ? (
					<p className="text-sm text-gousse-muted italic">
						No transactions reference this issuer yet.
					</p>
				) : (
					<ul className="divide-y divide-gousse-line rounded-md border border-gousse-line">
						{transactions.map((txn) => (
							<li
								key={txn.id}
								className="flex items-center gap-3 px-3 py-2 text-sm"
							>
								<span className="shrink-0 text-gousse-muted tabular-nums">
									{formatShortDate(txn.date)}
								</span>
								<span className="min-w-0 flex-1 truncate text-gousse-ink">
									{txn.rawIssuerString}
								</span>
								<span
									className={cn(
										"shrink-0 font-medium tabular-nums",
										txn.amount < 0 && "text-gousse-high",
										txn.amount > 0 && "text-gousse-low",
									)}
								>
									{formatCurrency(txn.amount)}
								</span>
							</li>
						))}
					</ul>
				)}
			</div>

			<div className="border-t border-gousse-line pt-6">
				<RulesSection issuer={issuer} />
			</div>

			<div className="flex flex-col gap-1 border-t border-gousse-line pt-6">
				<Button
					variant="danger"
					size="sm"
					className="self-start"
					onClick={handleDelete}
					disabled={hasTransactions || remove.isPending}
					title={
						hasTransactions
							? "This issuer is still referenced by transactions"
							: undefined
					}
				>
					Delete issuer
				</Button>
				{hasTransactions ? (
					<span className="text-xs text-gousse-muted tabular-nums">
						{count} transaction{count === 1 ? "" : "s"} reference this issuer —
						reassign them to delete.
					</span>
				) : null}
			</div>
		</section>
	);
}

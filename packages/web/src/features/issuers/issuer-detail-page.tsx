import type { Issuer, IssuerId } from "@mamen/shared/contract";
import { MAX_IMAGE_BYTES } from "@mamen/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useRef } from "react";
import { toast } from "sonner";
import { BackLink } from "@/components/back-link";
import { PageLayout } from "@/components/page-layout";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { RulesSection } from "@/features/rules/rules-section";
import type { TransactionsSearch } from "@/features/transactions/search";
import type { TransactionFilterValues } from "@/features/transactions/transactions-filters";
import {
	composeTransactionFilters,
	TransactionsSection,
} from "@/features/transactions/transactions-section";
import { formatCurrency } from "@/lib/format";
import {
	issuerQueries,
	type TransactionCountParams,
	transactionQueries,
} from "@/lib/sdk";
import { cn } from "@/lib/utils";
import { BUTTON_CLASS } from "./field-styles";
import { IssuerAvatar } from "./issuer-avatar";
import { IssuerDefaultCategoryPicker } from "./issuer-default-category-picker";
import { IssuerDetailSkeleton } from "./issuer-detail-skeleton";
import { IssuerNameField } from "./issuer-name-field";
import { IssuerNotesField } from "./issuer-notes-field";
import { IssuerRecapExclusionSection } from "./issuer-recap-exclusion-section";
import { LogoSearchPopover } from "./logo-search-popover";
import { useIssuerMutations } from "./use-issuer-mutations";

const routeApi = getRouteApi("/issuers/$issuerId/");

/**
 * The issuer **detail page** (PRD #8: single issuer surface) at
 * `/issuers/$issuerId`. Absorbs everything the old `IssuerEditDialog` did — the
 * header with avatar upload/remove, rename, and the guarded delete — and adds
 * the issuer's transactions list (count + net €) and its Matching Rules.
 *
 * This outer component owns the async read of the issuer and the loading /
 * not-found states; once it resolves it renders {@link IssuerDetailContent}.
 * Renaming lives in the header itself ({@link IssuerNameField}) — the heading is
 * the field.
 */
export function IssuerDetailPage() {
	const { issuerId } = routeApi.useParams();
	const id = Number(issuerId) as IssuerId;

	const issuerQuery = useQuery(issuerQueries.getById(id));

	if (issuerQuery.isPending) {
		// The wait is a page too (issue #129): the collapse flag outlives the
		// navigation that got here, so the way back to the panel has to survive the
		// read. The topbar is the settled page's, slot for slot — avatar, name and
		// the count/net line stand in where each will land, so the issuer arriving
		// fills the header rather than replacing it.
		return (
			<PageLayout
				back={<BackLink to="/issuers">Issuers</BackLink>}
				title={
					<>
						{/* `size-12` and `h-7`: the avatar's `lg` chip and one line of the
						    title's `text-2xl`, which is what lands in their place. */}
						<Skeleton as="span" className="block size-12 shrink-0" />
						<Skeleton as="span" className="block h-7 w-56" />
						{/* Never an empty heading: until the issuer names it, the page is
						    titled by what it is — the same stand-in the error state below
						    settles on. The wait itself is announced by the skeleton's live
						    region, so it is not said twice here. */}
						<span className="sr-only">Issuer</span>
					</>
				}
				description={
					<span className="flex items-baseline gap-2">
						<Skeleton as="span" className="block h-3.5 w-28" />
						<Skeleton as="span" className="block h-3.5 w-20" />
					</span>
				}
				className="gap-8"
			>
				<IssuerDetailSkeleton />
			</PageLayout>
		);
	}

	const issuer = issuerQuery.data as Issuer | undefined;
	if (issuerQuery.isError || issuer == null) {
		// Still a page, so still a topbar: this state has no name to show, but a
		// user who arrived here with the sidebar collapsed needs the way back to it
		// as much as on any other page (issue #129).
		return (
			<PageLayout
				title="Issuer"
				back={<BackLink to="/issuers">Issuers</BackLink>}
			>
				<Empty
					title="Couldn't load this issuer"
					description="It may have been deleted, or something went wrong. Head back to the grid."
				>
					<Link to="/issuers" className={cn(BUTTON_CLASS, "mt-2")}>
						Back to issuers
					</Link>
				</Empty>
			</PageLayout>
		);
	}

	return <IssuerDetailContent issuer={issuer} />;
}

interface IssuerDetailContentProps {
	issuer: Issuer;
}

/**
 * The resolved detail surface — everything that needs a loaded issuer.
 *
 * Deletion stays blocked while transactions reference the issuer (the button is
 * disabled with the existing explanation), so no row is ever left pointing at a
 * deleted issuer; a successful delete navigates back to the issuers grid. The
 * 2 MiB image cap is pre-checked here for an instant message (the contract's
 * multipart parser also enforces it server-side).
 */
function IssuerDetailContent({ issuer }: IssuerDetailContentProps) {
	const navigate = useNavigate();
	const search = routeApi.useSearch();
	const routeNavigate = routeApi.useNavigate();
	const { uploadImage, deleteImage, remove } = useIssuerMutations();
	const fileInputRef = useRef<HTMLInputElement>(null);

	const scope = useMemo<TransactionCountParams>(
		() => ({ issuerId: issuer.id }),
		[issuer.id],
	);

	// The unfiltered reference count — the delete guard asks "does *any* row
	// point here", which the user's account/month/search filters must not narrow.
	const referenceCountQuery = useQuery(transactionQueries.count(scope));
	const count = referenceCountQuery.data?.count ?? 0;
	const hasTransactions = count > 0;

	// The net over the *filtered* set, so the header total always describes the
	// rows shown beneath it (matching the category page's behaviour).
	const netQuery = useQuery(
		transactionQueries.count(composeTransactionFilters(scope, search)),
	);
	const net = netQuery.data?.total ?? 0;

	const applyFilters = (patch: TransactionFilterValues) => {
		routeNavigate({
			search: (prev: TransactionsSearch) => ({ ...prev, ...patch, page: 1 }),
		});
	};

	const toggleSort = () => {
		routeNavigate({
			search: (prev: TransactionsSearch) => ({
				...prev,
				direction: prev.direction === "asc" ? "desc" : "asc",
				page: 1,
			}),
		});
	};

	const goToPage = (page: number) => {
		routeNavigate({
			search: (prev: TransactionsSearch) => ({ ...prev, page }),
		});
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
		<PageLayout
			back={<BackLink to="/issuers">Issuers</BackLink>}
			// The name *is* the heading — click it to edit in place (no separate
			// rename form; edits autosave once typing settles). `flex-1` so the field
			// takes the whole row beside the avatar rather than shrink-wrapping.
			title={
				<>
					<IssuerAvatar
						imageUrl={issuer.imageUrl}
						defaultCategoryId={issuer.defaultCategoryId}
						size="lg"
					/>
					<span className="min-w-0 flex-1">
						<IssuerNameField issuer={issuer} />
					</span>
				</>
			}
			description={
				<span className="flex items-baseline gap-2 text-sm">
					<span className="tabular-nums">
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
				</span>
			}
			className="gap-8"
		>
			<div className="flex flex-wrap gap-2">
				<Button
					variant="secondary"
					size="sm"
					onClick={() => fileInputRef.current?.click()}
					disabled={uploadImage.isPending}
				>
					Upload image
				</Button>
				{/* The second way in: search rather than a file (issue #61). Beside
				    the upload because they answer the same question — the two paths
				    store byte-identical images (ADR 0007), so neither is the
				    fallback for the other. */}
				<LogoSearchPopover issuer={issuer} />
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

			<IssuerDefaultCategoryPicker issuer={issuer} />

			<IssuerNotesField issuer={issuer} />

			{/* The bulk exclusion lever (issue #69), directly above the rows it
			    governs — whether they count is read *through* the issuer, so this
			    is the one write that changes the whole list's arithmetic. */}
			<IssuerRecapExclusionSection issuer={issuer} />

			{/* The same table, filters, sort, and pagination as the transactions and
			    category pages — scoped to this issuer (issue #62). */}
			<div className="flex flex-col gap-6">
				<TransactionsSection
					scope={scope}
					search={search}
					onFiltersChange={applyFilters}
					onToggleSort={toggleSort}
					onPageChange={goToPage}
					emptyDescription="No transactions reference this issuer yet."
				>
					<h2 className="text-balance text-lg font-semibold text-gousse-ink">
						Transactions
					</h2>
				</TransactionsSection>
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
		</PageLayout>
	);
}

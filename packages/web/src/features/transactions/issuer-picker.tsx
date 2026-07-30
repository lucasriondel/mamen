import type { Issuer, Transaction } from "@mamen/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ExternalLink, Hand, SquarePen, Wand, X } from "lucide-react";
import { useState } from "react";
import {
	Command,
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
import { issuerQueries } from "@/lib/sdk";
import { IssuerSearchList } from "./issuer-search-list";
import { IssuerCell } from "./transaction-cells";
import { useAssignIssuer } from "./use-assign-issuer";

/** Which step of the picker is showing: the row actions, or the issuer search. */
type Mode = "actions" | "search";

export interface IssuerPickerProps {
	/** The transaction being curated — the assignment is written to this row only. */
	transaction: Transaction;
	/** The row's resolved issuer (looked up from `transaction.issuerId`). */
	issuer: Issuer;
}

/**
 * The issuer picker on a **resolved** transaction row. Where {@link AssignmentPicker}
 * resolves a row that has no issuer yet, this one curates a row that already has
 * one: it answers *why this issuer is here*, and offers the ways to act on that
 * answer.
 *
 * Two steps, mirroring the category picker's create flow rather than cramming
 * everything into one list. The first is a short menu of row actions — go read
 * the issuer's page, set a different issuer, drop a hand pick (manual rows only)
 * — none of which are searchable, so the step carries no search box at all. Only
 * "Set another issuer" leads to the second step, {@link IssuerSearchList}: the
 * search box plus results, the same shape as the assignment picker's "Match an
 * issuer" step, with **Back** to return.
 *
 * The provenance line reads from `manualIssuer`, the only provenance the model
 * keeps: a hand pick (`true`) is sticky and immune to rule changes; a rule match
 * (`false`) was derived at import. Which *specific* rule matched is not stored —
 * the matcher is stateless — so the line stays coarse and the issuer page (where
 * the rules live) is one click away rather than named here.
 *
 * Re-picking writes `manualIssuer: true`, same as a first-time match: choosing by
 * hand is a hand pick whether or not a rule had guessed first.
 *
 * **Remove** is the inverse, and shows only on a manual row — a rule-matched row
 * has no hand pick to drop, and removing there would re-derive to the same issuer
 * (a visible no-op). It clears the flag *and* re-derives server-side, so the row
 * lands on whichever rule claims it, or goes unmatched when none does. Removing a
 * hand pick therefore restores the rules rather than forcing a hole — the same
 * shape as the category picker's "Remove override".
 */
export function IssuerPicker({ transaction, issuer }: IssuerPickerProps) {
	const [open, setOpen] = useState(false);
	const [mode, setMode] = useState<Mode>("actions");
	const [query, setQuery] = useState("");
	const navigate = useNavigate();
	const { assignExisting, removeManualIssuer } = useAssignIssuer();

	// Only fetch the issuer list once the search step is actually reached — the
	// actions step never shows issuers, so opening the popover alone needn't pay
	// for the list.
	const issuersQuery = useQuery({
		...issuerQueries.list(),
		enabled: open && mode === "search",
	});
	const issuers = (issuersQuery.data?.items ?? []) as readonly Issuer[];

	const isManual = transaction.manualIssuer === true;
	const pending = assignExisting.isPending || removeManualIssuer.isPending;

	const handleOpenChange = (next: boolean) => {
		setOpen(next);
		// Reopen on the actions step, never mid-search.
		if (next) {
			setQuery("");
			setMode("actions");
		}
	};

	/** Re-assign this transaction to another issuer (a sticky hand pick). */
	const pick = (issuerId: Issuer["id"]) => {
		if (pending) return;
		assignExisting.mutate(
			{ transactionId: transaction.id, issuerId },
			{ onSuccess: () => setOpen(false) },
		);
	};

	/**
	 * Drop the hand pick, letting the rules re-derive this row's issuer. Offered
	 * only on a manual row: on a rule-matched row it would be a no-op (the server
	 * re-derives to the same issuer), so the action stays hidden there.
	 */
	const removeManual = () => {
		if (pending) return;
		removeManualIssuer.mutate(
			{ transactionId: transaction.id },
			{ onSuccess: () => setOpen(false) },
		);
	};

	const goToIssuer = () => {
		setOpen(false);
		navigate({
			to: "/issuers/$issuerId",
			params: { issuerId: String(issuer.id) },
		});
	};

	return (
		<Popover open={open} onOpenChange={handleOpenChange}>
			<PopoverTrigger asChild>
				<button
					type="button"
					className="block rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-gousse-accent"
					title="Change the issuer for this transaction"
				>
					<IssuerCell
						rawIssuerString={transaction.rawIssuerString}
						issuer={issuer}
						isManual={isManual}
					/>
				</button>
			</PopoverTrigger>
			<PopoverContent className="p-0">
				<Command shouldFilter={false} label="Change the issuer">
					{mode === "search" ? (
						<IssuerSearchList
							issuers={issuers}
							query={query}
							onQueryChange={setQuery}
							currentIssuerId={issuer.id}
							onPick={pick}
							onBack={() => setMode("actions")}
							disabled={pending}
						/>
					) : (
						<>
							<ProvenanceLine isManual={isManual} />
							{/* cmdk drives arrow-key nav and Enter from its input, so the
							    step needs one even though there is nothing to search here:
							    without it focus stays on the popover container and the menu
							    is mouse-only. Hidden visually, not from assistive tech —
							    it is the element that owns the active-item announcement. */}
							<CommandInput
								value=""
								onValueChange={() => {}}
								readOnly
								className="sr-only"
								wrapperClassName="sr-only"
								aria-label="Issuer actions"
							/>
							<CommandList>
								<CommandGroup>
									<CommandItem value="__go_to_issuer__" onSelect={goToIssuer}>
										<ExternalLink
											size={16}
											className="shrink-0 text-gousse-muted"
											aria-hidden
										/>
										<span className="truncate">Go to {issuer.name}</span>
									</CommandItem>
									<CommandItem
										value="__set_another_issuer__"
										onSelect={() => setMode("search")}
										disabled={pending}
									>
										<SquarePen
											size={16}
											className="shrink-0 text-gousse-muted"
											aria-hidden
										/>
										<span className="truncate">Set another issuer</span>
									</CommandItem>
									{isManual ? (
										<CommandItem
											value="__remove_manual_issuer__"
											onSelect={removeManual}
											disabled={pending}
										>
											<X
												size={16}
												className="shrink-0 text-gousse-muted"
												aria-hidden
											/>
											<span className="truncate">Remove manual issuer</span>
										</CommandItem>
									) : null}
								</CommandGroup>
							</CommandList>
						</>
					)}
				</Command>
			</PopoverContent>
		</Popover>
	);
}

/**
 * The header line answering *why this issuer is here*: a hand pick, or a rule
 * match. Coarse by construction — the matched rule id is not persisted.
 */
function ProvenanceLine({ isManual }: { isManual: boolean }) {
	const Icon = isManual ? Hand : Wand;
	return (
		<p className="flex items-center gap-1.5 border-gousse-line border-b px-3 py-2 text-gousse-muted text-xs">
			<Icon size={13} className="shrink-0" aria-hidden />
			<span>
				{isManual
					? "Set manually on this transaction"
					: "Matched automatically by a rule"}
			</span>
		</p>
	);
}

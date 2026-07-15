import type { Issuer, Transaction } from "@mamen/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Check, ExternalLink, Hand, Wand } from "lucide-react";
import { useState } from "react";
import {
	Command,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
} from "@/components/ui/command";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { IssuerAvatar } from "@/features/issuers/issuer-avatar";
import { issuerQueries } from "@/lib/sdk";
import { IssuerCell } from "./transaction-cells";
import { useAssignIssuer } from "./use-assign-issuer";

/** Case-insensitive substring match of an issuer name against the query. */
function matches(issuer: Issuer, query: string): boolean {
	return issuer.name.toLowerCase().includes(query.trim().toLowerCase());
}

export interface IssuerPickerProps {
	/** The transaction being curated — the assignment is written to this row only. */
	transaction: Transaction;
	/** The row's resolved issuer (looked up from `transaction.issuerId`). */
	issuer: Issuer;
}

/**
 * The issuer picker on a **resolved** transaction row. Where {@link AssignmentPicker}
 * resolves a row that has no issuer yet, this one curates a row that already has
 * one: it answers *why this issuer is here*, and offers the two ways to act on
 * that answer — pick a different issuer, or go read the issuer's page.
 *
 * The provenance line reads from `manualIssuer`, the only provenance the model
 * keeps: a hand pick (`true`) is sticky and immune to rule changes; a rule match
 * (`false`) was derived at import. Which *specific* rule matched is not stored —
 * the matcher is stateless — so the line stays coarse and the issuer page (where
 * the rules live) is one click away rather than named here.
 *
 * Re-picking writes `manualIssuer: true`, same as a first-time match: choosing by
 * hand is a hand pick whether or not a rule had guessed first.
 */
export function IssuerPicker({ transaction, issuer }: IssuerPickerProps) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const navigate = useNavigate();
	const { assignExisting } = useAssignIssuer();

	// Only fetch the issuer list once the picker is opened.
	const issuersQuery = useQuery({ ...issuerQueries.list(), enabled: open });
	const issuers = (issuersQuery.data?.items ?? []) as readonly Issuer[];

	const isManual = transaction.manualIssuer === true;
	const filtered = issuers.filter((candidate) => matches(candidate, query));
	const pending = assignExisting.isPending;

	const handleOpenChange = (next: boolean) => {
		setOpen(next);
		if (next) setQuery("");
	};

	/** Re-assign this transaction to another issuer (a sticky hand pick). */
	const pick = (issuerId: Issuer["id"]) => {
		if (pending) return;
		assignExisting.mutate(
			{ transactionId: transaction.id, issuerId },
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
					className="block text-left"
					title="Change the issuer for this transaction"
				>
					<IssuerCell
						rawIssuerString={transaction.rawIssuerString}
						issuer={issuer}
					/>
				</button>
			</PopoverTrigger>
			<PopoverContent className="p-0">
				<Command shouldFilter={false} label="Change the issuer">
					<ProvenanceLine isManual={isManual} />
					<CommandInput
						value={query}
						onValueChange={setQuery}
						placeholder="Search issuers…"
						aria-label="Search issuers"
					/>
					<CommandList>
						{/* Not `CommandEmpty` — the "Go to" action below is always
						    mounted, so cmdk never sees an empty list and would never
						    render it. A plain node states the miss regardless. */}
						{filtered.length === 0 ? (
							<p className="px-3 py-4 text-center text-muted text-sm">
								No issuers found.
							</p>
						) : null}

						{filtered.length > 0 ? (
							<CommandGroup heading="Set another issuer">
								{filtered.map((candidate) => (
									<CommandItem
										key={candidate.id}
										value={`issuer-${candidate.id}`}
										onSelect={() => pick(candidate.id)}
										disabled={pending}
									>
										<IssuerAvatar
											name={candidate.name}
											imageUrl={candidate.imageUrl}
										/>
										<span className="truncate">{candidate.name}</span>
										{candidate.id === issuer.id ? (
											<Check
												size={14}
												className="ml-auto shrink-0 text-accent"
												aria-label="Current issuer"
											/>
										) : null}
									</CommandItem>
								))}
							</CommandGroup>
						) : null}

						<CommandSeparator />
						<CommandGroup>
							<CommandItem value="__go_to_issuer__" onSelect={goToIssuer}>
								<ExternalLink
									size={16}
									className="shrink-0 text-muted"
									aria-hidden
								/>
								<span className="truncate">Go to {issuer.name}</span>
							</CommandItem>
						</CommandGroup>
					</CommandList>
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
		<p className="flex items-center gap-1.5 border-line border-b px-3 py-2 text-muted text-xs">
			<Icon size={13} className="shrink-0" aria-hidden />
			<span>
				{isManual
					? "Set manually on this transaction"
					: "Matched automatically by a rule"}
			</span>
		</p>
	);
}

import type { Issuer, IssuerId, TransactionId } from "@mamen/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { CircleHelp, Plus } from "lucide-react";
import { useState } from "react";
import {
	Command,
	CommandEmpty,
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
import { useAssignIssuer } from "./use-assign-issuer";

export interface AssignmentPickerProps {
	/** The transaction being curated. */
	transactionId: TransactionId;
	/** The row's raw counterparty text — pre-fills the "create new issuer" action. */
	rawIssuerString: string;
}

/** Case-insensitive substring match of an issuer name against the query. */
function matches(issuer: Issuer, query: string): boolean {
	return issuer.name.toLowerCase().includes(query.trim().toLowerCase());
}

/**
 * The issuer **assignment picker** — the click-to-resolve interaction on an
 * unresolved transaction row (PRD). A `cmdk` command palette in a popover
 * anchored to the issuer cell:
 *
 * - Search existing issuers by name and assign one (`update({ issuerId })`).
 * - When nothing matches, the top action is "create new issuer" pre-filled with
 *   the raw counterparty string (`create` → `update({ issuerId })`).
 *
 * The input opens pre-filled with the raw string so the common case — this
 * counterparty is new — is one keystroke (Enter). `cmdk`'s own filtering is
 * disabled (`shouldFilter={false}`) so the create action is always reachable and
 * ordering is deterministic. Assignment is single-transaction (v1).
 */
export function AssignmentPicker({
	transactionId,
	rawIssuerString,
}: AssignmentPickerProps) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState(rawIssuerString);
	const { assignExisting, createAndAssign } = useAssignIssuer();

	// Only fetch the issuer list once the picker is opened.
	const issuersQuery = useQuery({ ...issuerQueries.list(), enabled: open });
	const issuers = (issuersQuery.data?.items ?? []) as readonly Issuer[];

	const filtered = issuers.filter((issuer) => matches(issuer, query));
	const trimmed = query.trim();
	const hasExact = issuers.some(
		(issuer) => issuer.name.trim().toLowerCase() === trimmed.toLowerCase(),
	);
	const canCreate = trimmed.length > 0 && !hasExact;
	const pending = assignExisting.isPending || createAndAssign.isPending;

	const handleOpenChange = (next: boolean) => {
		setOpen(next);
		// Reset the query to the raw string each time the picker reopens.
		if (next) setQuery(rawIssuerString);
	};

	const close = () => setOpen(false);

	const assign = (issuerId: IssuerId) => {
		if (pending) return;
		assignExisting.mutate({ transactionId, issuerId }, { onSuccess: close });
	};

	const create = () => {
		if (pending || trimmed.length === 0) return;
		createAndAssign.mutate(
			{ transactionId, name: trimmed },
			{ onSuccess: close },
		);
	};

	return (
		<Popover open={open} onOpenChange={handleOpenChange}>
			<PopoverTrigger asChild>
				<button
					type="button"
					className="flex items-center gap-1.5 text-muted italic transition-colors hover:text-ink"
					title="Assign an issuer"
					data-unresolved="true"
				>
					<CircleHelp size={14} className="shrink-0" aria-hidden />
					<span className="truncate">{rawIssuerString}</span>
				</button>
			</PopoverTrigger>
			<PopoverContent className="p-0">
				<Command shouldFilter={false} label="Assign an issuer">
					<CommandInput
						value={query}
						onValueChange={setQuery}
						placeholder="Search issuers…"
						aria-label="Search issuers"
					/>
					<CommandList>
						{!canCreate && filtered.length === 0 ? (
							<CommandEmpty>No issuers yet.</CommandEmpty>
						) : null}

						{filtered.length > 0 ? (
							<CommandGroup heading="Issuers">
								{filtered.map((issuer) => (
									<CommandItem
										key={issuer.id}
										value={`issuer-${issuer.id}`}
										onSelect={() => assign(issuer.id)}
										disabled={pending}
									>
										<IssuerAvatar
											name={issuer.name}
											imageUrl={issuer.imageUrl}
										/>
										<span className="truncate">{issuer.name}</span>
									</CommandItem>
								))}
							</CommandGroup>
						) : null}

						{canCreate ? (
							<>
								{filtered.length > 0 ? <CommandSeparator /> : null}
								<CommandGroup>
									<CommandItem
										value="__create__"
										onSelect={create}
										disabled={pending}
									>
										<Plus
											size={16}
											className="shrink-0 text-muted"
											aria-hidden
										/>
										<span className="truncate">
											Create new issuer “{trimmed}”
										</span>
									</CommandItem>
								</CommandGroup>
							</>
						) : null}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}

import type { Issuer, IssuerId, TransactionId } from "@mamen/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, CircleHelp, Plus, SquarePen } from "lucide-react";
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
	/** The row's raw counterparty text — seeds the query and the pre-filled rule pattern. */
	rawIssuerString: string;
}

/** Which action an issuer selection performs. */
type Mode = "match" | "add-rule";

/** Case-insensitive substring match of an issuer name against the query. */
function matches(issuer: Issuer, query: string): boolean {
	return issuer.name.toLowerCase().includes(query.trim().toLowerCase());
}

/**
 * The issuer **assignment picker** — the click-to-resolve interaction on an
 * unresolved transaction row (PRD; issue #18). A `cmdk` command palette in a
 * popover anchored to the issuer cell, offering three distinct actions:
 *
 * 1. **Create issuer with a rule** — mint a new issuer from the raw counterparty
 *    string, then jump to its rule-create page with the raw name pre-filled as
 *    the pattern (`/issuers/$id/rules/new?pattern=<raw>`).
 * 2. **Add a rule to an existing issuer** — pick an existing issuer, then jump to
 *    that issuer's rule-create page with the pattern pre-filled.
 * 3. **Match an issuer** — assign an existing issuer to this one transaction
 *    (`manualIssuer: true`, a sticky hand pick).
 *
 * A `mode` switches what selecting an issuer row does: in `match` mode (default)
 * it assigns; in `add-rule` mode it navigates to the issuer's rule page. The
 * "create issuer with a rule" action sits at the bottom, pre-filled with the raw
 * string, so the common "this counterparty is new" case is close at hand.
 * `cmdk`'s own filtering is disabled (`shouldFilter={false}`) so every action is
 * always reachable and ordering is deterministic.
 */
export function AssignmentPicker({
	transactionId,
	rawIssuerString,
}: AssignmentPickerProps) {
	const [open, setOpen] = useState(false);
	const [mode, setMode] = useState<Mode>("match");
	const [query, setQuery] = useState(rawIssuerString);
	const navigate = useNavigate();
	const { assignExisting, createIssuer } = useAssignIssuer();

	// Only fetch the issuer list once the picker is opened.
	const issuersQuery = useQuery({ ...issuerQueries.list(), enabled: open });
	const issuers = (issuersQuery.data?.items ?? []) as readonly Issuer[];

	const filtered = issuers.filter((issuer) => matches(issuer, query));
	const trimmed = query.trim();
	const hasExact = issuers.some(
		(issuer) => issuer.name.trim().toLowerCase() === trimmed.toLowerCase(),
	);
	const canCreate = trimmed.length > 0 && !hasExact;
	const pending = assignExisting.isPending || createIssuer.isPending;

	const handleOpenChange = (next: boolean) => {
		setOpen(next);
		// Reset the query and mode each time the picker reopens.
		if (next) {
			setQuery(rawIssuerString);
			setMode("match");
		}
	};

	const close = () => setOpen(false);

	/** Jump to an issuer's rule-create page, pattern pre-filled from the raw name. */
	const goToNewRule = (issuerId: IssuerId) => {
		close();
		navigate({
			to: "/issuers/$issuerId/rules/new",
			params: { issuerId: String(issuerId) },
			search: { pattern: rawIssuerString },
		});
	};

	/** Match: assign an existing issuer to this transaction (sticky hand pick). */
	const match = (issuerId: IssuerId) => {
		if (pending) return;
		assignExisting.mutate({ transactionId, issuerId }, { onSuccess: close });
	};

	/** Create a new issuer from the raw string, then go to its rule-create page. */
	const createWithRule = () => {
		if (pending || trimmed.length === 0) return;
		createIssuer.mutate(
			{ name: trimmed },
			{ onSuccess: (issuer) => goToNewRule(issuer.id) },
		);
	};

	/** What selecting an issuer row does, per the current mode. */
	const onSelectIssuer = (issuerId: IssuerId) => {
		if (mode === "add-rule") goToNewRule(issuerId);
		else match(issuerId);
	};

	/**
	 * Enter "add a rule to an existing issuer" mode and clear the query — the raw
	 * string seeds the *match* search, but here the user browses all issuers.
	 */
	const enterAddRule = () => {
		setMode("add-rule");
		setQuery("");
	};

	/** Return to match mode, restoring the raw string as the search seed. */
	const backToMatch = () => {
		setMode("match");
		setQuery(rawIssuerString);
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
						placeholder={
							mode === "add-rule"
								? "Pick an issuer to add a rule to…"
								: "Search issuers…"
						}
						aria-label="Search issuers"
					/>
					<CommandList>
						{mode === "add-rule" && filtered.length === 0 ? (
							<CommandEmpty>No issuers to add a rule to.</CommandEmpty>
						) : null}
						{mode === "match" && !canCreate && filtered.length === 0 ? (
							<CommandEmpty>No issuers yet.</CommandEmpty>
						) : null}

						{filtered.length > 0 ? (
							<CommandGroup
								heading={
									mode === "add-rule" ? "Add a rule to…" : "Match an issuer"
								}
							>
								{filtered.map((issuer) => (
									<CommandItem
										key={issuer.id}
										value={`issuer-${issuer.id}`}
										onSelect={() => onSelectIssuer(issuer.id)}
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

						{mode === "add-rule" ? (
							<>
								{filtered.length > 0 ? <CommandSeparator /> : null}
								<CommandGroup>
									<CommandItem value="__back__" onSelect={backToMatch}>
										<ArrowLeft
											size={16}
											className="shrink-0 text-muted"
											aria-hidden
										/>
										<span className="truncate">Back</span>
									</CommandItem>
								</CommandGroup>
							</>
						) : (
							<>
								<CommandSeparator />
								<CommandGroup heading="Or">
									<CommandItem
										value="__add_rule__"
										onSelect={enterAddRule}
										disabled={pending}
									>
										<SquarePen
											size={16}
											className="shrink-0 text-muted"
											aria-hidden
										/>
										<span className="truncate">
											Add a rule to an existing issuer
										</span>
									</CommandItem>
									{canCreate ? (
										<CommandItem
											value="__create__"
											onSelect={createWithRule}
											disabled={pending}
										>
											<Plus
												size={16}
												className="shrink-0 text-muted"
												aria-hidden
											/>
											<span className="truncate">
												Create issuer “{trimmed}” with a rule
											</span>
										</CommandItem>
									) : null}
								</CommandGroup>
							</>
						)}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}

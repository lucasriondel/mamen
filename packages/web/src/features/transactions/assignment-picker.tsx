import type { IssuerId, TransactionId } from "@mamen/shared/contract";
import { useNavigate } from "@tanstack/react-router";
import {
	ArrowLeft,
	CircleHelp,
	ExternalLink,
	Plus,
	Search,
	SquarePen,
} from "lucide-react";
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
import { hasExactIssuerName } from "@/features/issuers/issuer-name";
import { useIssuerSearch } from "@/features/issuers/use-issuer-search";
import { escapeRegex } from "@/features/rules/escape-regex";
import { formatShortDate } from "@/lib/format";
import { isPaypalRawIssuer, paypalActivityUrl } from "./paypal-activity";
import { useAssignIssuer } from "./use-assign-issuer";

export interface AssignmentPickerProps {
	/** The transaction being curated. */
	transactionId: TransactionId;
	/** The row's raw counterparty text — seeds the query and the pre-filled rule pattern. */
	rawIssuerString: string;
	/** The transaction's date — dates the PayPal activity lookup window. */
	date: Date;
}

/** Which action an issuer selection performs. */
type Mode = "match" | "add-rule";

/**
 * The issuer **assignment picker** — the click-to-resolve interaction on an
 * unresolved transaction row (PRD; issue #18). A `cmdk` command palette in a
 * popover anchored to the issuer cell, offering three distinct actions:
 *
 * 1. **Create issuer with a rule** — mint a new issuer from the raw counterparty
 *    string, then jump to its rule-create page with the raw name pre-filled as
 *    the pattern, regex-escaped (`/issuers/$id/rules/new?pattern=<escaped>`).
 * 2. **Add a rule to an existing issuer** — pick an existing issuer, then jump to
 *    that issuer's rule-create page with the pattern pre-filled.
 * 3. **Match an issuer** — assign an existing issuer to this one transaction
 *    (`manualIssuer: true`, a sticky hand pick).
 * 4. **Search on Google** — open the raw counterparty string, quoted, in a new
 *    tab. Resolving a row often stalls on *who is this?* rather than on which
 *    issuer to pick, and the answer lives outside the app.
 * 5. **Open PayPal activity** — for PayPal rows only, where the bank label names
 *    PayPal instead of the merchant, so the answer lives in the PayPal feed
 *    around the transaction's date.
 *
 * A `mode` switches what selecting an issuer row does: in `match` mode (default)
 * it assigns; in `add-rule` mode it navigates to the issuer's rule page. The
 * "create issuer with a rule" action sits at the bottom, pre-filled with the raw
 * string, so the common "this counterparty is new" case is close at hand.
 * `cmdk`'s own filtering is disabled (`shouldFilter={false}`) so every action is
 * always reachable and ordering is deterministic.
 *
 * The issuers offered are the ones the *server* matched on what is typed
 * (`useIssuerSearch`), never a page of the table filtered here: past that page
 * an issuer that plainly existed could not be picked (#79).
 */
export function AssignmentPicker({
	transactionId,
	rawIssuerString,
	date,
}: AssignmentPickerProps) {
	const [open, setOpen] = useState(false);
	const [mode, setMode] = useState<Mode>("match");
	const [query, setQuery] = useState(rawIssuerString);
	const navigate = useNavigate();
	const { assignExisting, createIssuer } = useAssignIssuer();

	// Only search once the picker is opened. The row is unresolved, so it puts no
	// issuer on screen to pin — every candidate comes from the search (#79),
	// already narrowed to what is typed.
	const issuers = useIssuerSearch({ query, enabled: open });

	const trimmed = query.trim();
	// The duplicate-name guard reads the matches for the very text it would
	// create, so the name it looks for is the one the server was asked about —
	// where a page of the table only ever held it by luck. Still a UX nicety, not
	// an invariant (the contract enforces no uniqueness): a duplicate can hide
	// when more issuers than one page contain the name as a substring.
	const canCreate = trimmed.length > 0 && !hasExactIssuerName(issuers, trimmed);
	const pending = assignExisting.isPending || createIssuer.isPending;
	const isPaypal = isPaypalRawIssuer(rawIssuerString);

	const handleOpenChange = (next: boolean) => {
		setOpen(next);
		// Reset the query and mode each time the picker reopens.
		if (next) {
			setQuery(rawIssuerString);
			setMode("match");
		}
	};

	const close = () => setOpen(false);

	/**
	 * Jump to an issuer's rule-create page, pattern pre-filled from the raw name.
	 * The raw string is escaped: the field is regex source, and counterparty text
	 * like `CARREFOUR (PARIS)` or `AMAZON*MKTPLACE` would otherwise over-match
	 * (or, for a leading `*`, not compile at all).
	 */
	const goToNewRule = (issuerId: IssuerId) => {
		close();
		navigate({
			to: "/issuers/$issuerId/rules/new",
			params: { issuerId: String(issuerId) },
			search: { pattern: escapeRegex(rawIssuerString) },
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

	/**
	 * Look the raw counterparty string up on Google, in a new tab. Quoted so the
	 * search is an exact-phrase one: bank strings are noisy tokens (`SEPA`, store
	 * codes, dates) that Google otherwise splits and paraphrases into nothing
	 * useful. `noopener,noreferrer` because the opened tab is untrusted.
	 */
	const searchOnGoogle = () => {
		close();
		const url = `https://www.google.com/search?q=${encodeURIComponent(
			`"${rawIssuerString}"`,
		)}`;
		window.open(url, "_blank", "noopener,noreferrer");
	};

	/**
	 * Open the PayPal activity feed, windowed around the transaction's date, in a
	 * new tab. Offered only on PayPal rows: the bank label names PayPal, never the
	 * merchant, so the feed is where the real issuer is identified.
	 * `noopener,noreferrer` because the opened tab is untrusted.
	 */
	const openPaypalActivity = () => {
		close();
		window.open(paypalActivityUrl(date), "_blank", "noopener,noreferrer");
	};

	/** What selecting an issuer row does, per the current mode. */
	const onSelectIssuer = (issuerId: IssuerId) => {
		if (mode === "add-rule") goToNewRule(issuerId);
		else match(issuerId);
	};

	/**
	 * Enter "add a rule to an existing issuer" mode and clear the query — the raw
	 * string seeds the *match* search, but here the user is looking for an issuer
	 * it plainly doesn't name, so the box starts empty and browses from the top.
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
					className="flex items-center gap-1.5 rounded-sm px-1 py-0.5 text-gousse-muted italic outline-none transition-colors hover:text-gousse-ink focus-visible:ring-2 focus-visible:ring-gousse-accent"
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
						{mode === "add-rule" && issuers.length === 0 ? (
							<CommandEmpty>No issuers to add a rule to.</CommandEmpty>
						) : null}
						{mode === "match" && !canCreate && issuers.length === 0 ? (
							<CommandEmpty>No issuers yet.</CommandEmpty>
						) : null}

						{issuers.length > 0 ? (
							<CommandGroup
								heading={
									mode === "add-rule" ? "Add a rule to…" : "Match an issuer"
								}
							>
								{issuers.map((issuer) => (
									<CommandItem
										key={issuer.id}
										value={`issuer-${issuer.id}`}
										onSelect={() => onSelectIssuer(issuer.id)}
										disabled={pending}
									>
										<IssuerAvatar
											imageUrl={issuer.imageUrl}
											defaultCategoryId={issuer.defaultCategoryId}
										/>
										<span className="truncate">{issuer.name}</span>
									</CommandItem>
								))}
							</CommandGroup>
						) : null}

						{mode === "add-rule" ? (
							<>
								{issuers.length > 0 ? <CommandSeparator /> : null}
								<CommandGroup>
									<CommandItem value="__back__" onSelect={backToMatch}>
										<ArrowLeft
											size={16}
											className="shrink-0 text-gousse-muted"
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
											className="shrink-0 text-gousse-muted"
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
												className="shrink-0 text-gousse-muted"
												aria-hidden
											/>
											<span className="truncate">
												Create issuer “{trimmed}” with a rule
											</span>
										</CommandItem>
									) : null}
									<CommandItem
										value="__google_search__"
										onSelect={searchOnGoogle}
									>
										<Search
											size={16}
											className="shrink-0 text-gousse-muted"
											aria-hidden
										/>
										<span className="truncate">
											Search “{rawIssuerString}” on Google
										</span>
									</CommandItem>
									{isPaypal ? (
										<CommandItem
											value="__paypal_activity__"
											onSelect={openPaypalActivity}
										>
											<ExternalLink
												size={16}
												className="shrink-0 text-gousse-muted"
												aria-hidden
											/>
											<span className="truncate">
												Open PayPal activity around {formatShortDate(date)}
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

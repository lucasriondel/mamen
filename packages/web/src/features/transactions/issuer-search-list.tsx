import type { Issuer } from "@mamen/shared/contract";
import { ArrowLeft, Check } from "lucide-react";
import {
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
} from "@/components/ui/command";
import { IssuerAvatar } from "@/features/issuers/issuer-avatar";

export interface IssuerSearchListProps {
	/**
	 * The issuers to offer, already narrowed to `query` by the parent
	 * (`useIssuerSearch`) — the row's own plus the current search page. Never
	 * "every issuer": there is no page that holds them all (#79).
	 */
	issuers: readonly Issuer[];
	/** What is typed. Displayed here; the *matching* is the parent's (#79). */
	query: string;
	onQueryChange: (next: string) => void;
	/** The row's current issuer — marked with a check, not hidden. */
	currentIssuerId: Issuer["id"];
	/**
	 * What the check on that row means. Defaults to the assignment reading; the
	 * rule move panel marks its *chosen target* instead, and a check announcing
	 * "Current issuer" there would name the wrong end of the move.
	 */
	currentLabel?: string;
	onPick: (issuerId: Issuer["id"]) => void;
	/**
	 * Back to whatever step led here. **Optional**: a surface that reaches the
	 * search directly (the rule move panel, whose way out is Cancel) has no step
	 * to go back to, and an inert "Back" row would be a lie about the shape of the
	 * flow. Omitted ⇒ the row isn't rendered at all.
	 */
	onBack?: () => void;
	/** Heading over the offered issuers — the question this list is answering. */
	heading?: string;
	/** True while a mutation is in flight; every row goes inert. */
	disabled: boolean;
}

/**
 * The **search step** of {@link IssuerPicker}: a search box over the issuers the
 * parent resolved, with **Back** to the row actions. The same shape as the
 * assignment picker's "Match an issuer" step, so re-pointing a resolved row and
 * resolving an unresolved one look and behave alike.
 *
 * Filtering is neither ours nor `cmdk`'s (`shouldFilter={false}` on the parent
 * `Command`): the parent hands over the issuers that match, so ordering stays
 * deterministic and **Back** is always reachable regardless of the query. The
 * current issuer stays in the list with a check rather than being filtered out —
 * seeing it marked is what makes the list read as "which issuer is this?" rather
 * than "what else could it be?".
 */
export function IssuerSearchList({
	issuers,
	query,
	onQueryChange,
	currentIssuerId,
	currentLabel = "Current issuer",
	onPick,
	onBack,
	heading = "Set another issuer",
	disabled,
}: IssuerSearchListProps) {
	return (
		<>
			<CommandInput
				value={query}
				onValueChange={onQueryChange}
				placeholder="Search issuers…"
				aria-label="Search issuers"
			/>
			<CommandList>
				{/* A plain node, not `CommandEmpty` — that renders off cmdk's own
				    filtering, which `shouldFilter={false}` turns off. */}
				{issuers.length === 0 ? (
					<p className="px-3 py-4 text-center text-gousse-muted text-sm">
						No issuers found.
					</p>
				) : null}

				{issuers.length > 0 ? (
					<CommandGroup heading={heading}>
						{issuers.map((candidate) => (
							<CommandItem
								key={candidate.id}
								value={`issuer-${candidate.id}`}
								onSelect={() => onPick(candidate.id)}
								disabled={disabled}
							>
								<IssuerAvatar
									imageUrl={candidate.imageUrl}
									defaultCategoryId={candidate.defaultCategoryId}
								/>
								<span className="truncate">{candidate.name}</span>
								{candidate.id === currentIssuerId ? (
									<Check
										size={14}
										className="ml-auto shrink-0 text-gousse-accent"
										aria-label={currentLabel}
									/>
								) : null}
							</CommandItem>
						))}
					</CommandGroup>
				) : null}

				{onBack ? (
					<>
						{issuers.length > 0 ? <CommandSeparator /> : null}
						<CommandGroup>
							<CommandItem value="__back__" onSelect={onBack}>
								<ArrowLeft
									size={16}
									className="shrink-0 text-gousse-muted"
									aria-hidden
								/>
								<span className="truncate">Back</span>
							</CommandItem>
						</CommandGroup>
					</>
				) : null}
			</CommandList>
		</>
	);
}

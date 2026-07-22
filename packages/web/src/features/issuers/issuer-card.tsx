import type { Issuer } from "@mamen/shared/contract";
import { Link } from "@tanstack/react-router";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { IssuerAvatar } from "./issuer-avatar";

export interface IssuerCardProps {
	issuer: Issuer;
	/** Number of transactions for the issuer. */
	count: number;
	/**
	 * Signed net flow (debits negative, credits positive). Derived by the grid
	 * once from the issuer's transactions and passed in, so sorting and the card
	 * share a single source of truth (issue #41).
	 */
	net: number;
}

/**
 * One issuer in the grid: avatar, name, transaction count, and net € total
 * (PRD). The count and net are computed by {@link IssuersView} from the issuer's
 * transactions and handed down as props — the card is presentational so the grid
 * can sort by those figures without each card re-deriving them. Clicking the
 * card navigates to the issuer detail page (`/issuers/$issuerId`), not a dialog.
 */
export function IssuerCard({ issuer, count, net }: IssuerCardProps) {
	return (
		<Link
			to="/issuers/$issuerId"
			params={{ issuerId: String(issuer.id) }}
			className="flex flex-col items-start gap-3 rounded-lg border border-line bg-panel p-4 text-left outline-none transition-[transform,border-color] duration-150 hover:border-accent focus-visible:ring-2 focus-visible:ring-accent active:scale-[0.98]"
		>
			<div className="flex w-full items-center gap-3">
				<IssuerAvatar name={issuer.name} imageUrl={issuer.imageUrl} size="lg" />
				<span className="min-w-0 flex-1 truncate font-medium text-ink">
					{issuer.name}
				</span>
			</div>
			<div className="flex w-full items-baseline justify-between">
				<span className="text-sm text-muted tabular-nums">
					{count} transaction{count === 1 ? "" : "s"}
				</span>
				<span
					className={cn(
						"text-sm font-medium tabular-nums",
						net < 0 && "text-high",
						net > 0 && "text-low",
					)}
				>
					{formatCurrency(net)}
				</span>
			</div>
		</Link>
	);
}

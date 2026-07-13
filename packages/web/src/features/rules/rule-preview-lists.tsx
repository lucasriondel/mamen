import type {
	Issuer,
	RulePreviewResult,
	Transaction,
} from "@mamen/shared/contract";
import { formatCurrency, formatShortDate } from "@/lib/format";

interface PreviewRowProps {
	transaction: Transaction;
	/** Issuer lookup for resolving a row's current issuer name. */
	issuersById: ReadonlyMap<number, Issuer>;
	/** Rendered at the row's trailing edge (e.g. the remove-manual-issuer action). */
	action?: React.ReactNode;
}

/** One transaction line inside a preview list — date, raw string, current issuer, amount. */
function PreviewRow({ transaction, issuersById, action }: PreviewRowProps) {
	const currentIssuer =
		transaction.issuerId != null
			? issuersById.get(transaction.issuerId)
			: undefined;

	return (
		<li className="flex items-center gap-2 py-1.5 text-sm">
			<span className="shrink-0 text-muted tabular-nums">
				{formatShortDate(transaction.date)}
			</span>
			<span className="min-w-0 flex-1 truncate text-ink">
				{transaction.rawIssuerString}
			</span>
			{currentIssuer ? (
				<span className="shrink-0 truncate text-muted">
					→ {currentIssuer.name}
				</span>
			) : null}
			<span className="shrink-0 tabular-nums text-muted">
				{formatCurrency(transaction.amount)}
			</span>
			{action}
		</li>
	);
}

interface PreviewListProps {
	title: string;
	description: string;
	transactions: readonly Transaction[];
	issuersById: ReadonlyMap<number, Issuer>;
	/** Per-row trailing action factory (used for the manual-collision list). */
	renderAction?: (transaction: Transaction) => React.ReactNode;
}

/** One titled section of the preview — a labelled, counted list of transactions. */
function PreviewList({
	title,
	description,
	transactions,
	issuersById,
	renderAction,
}: PreviewListProps) {
	return (
		<section className="flex flex-col gap-1">
			<h4 className="text-sm font-medium text-ink">
				{title}{" "}
				<span className="font-normal text-muted">({transactions.length})</span>
			</h4>
			<p className="text-xs text-muted">{description}</p>
			{transactions.length === 0 ? (
				<p className="py-1 text-sm text-muted italic">None.</p>
			) : (
				<ul className="divide-y divide-line">
					{transactions.map((transaction) => (
						<PreviewRow
							key={transaction.id}
							transaction={transaction}
							issuersById={issuersById}
							action={renderAction?.(transaction)}
						/>
					))}
				</ul>
			)}
		</section>
	);
}

export interface RulePreviewListsProps {
	preview: RulePreviewResult;
	issuersById: ReadonlyMap<number, Issuer>;
	/** Per-row "remove manual issuer" action for the manual-collision rows. */
	renderManualAction?: (transaction: Transaction) => React.ReactNode;
}

/**
 * The Matching Rule preview's **three lists** (PRD #8 stories 7–11), scoped to
 * one rule's pattern:
 *
 * - **will match** — currently-unmatched rows this rule claims;
 * - **will reassign** — rows another issuer's rule owns that this rule now wins;
 * - **manual collisions** — rows matching the pattern but assigned by hand, left
 *   untouched by default (each offers a per-row "remove manual issuer" action).
 *
 * When the pattern is an invalid regex the server reports `skipped`; all three
 * lists come back empty and we show a hint rather than a silent blank (story 19).
 */
export function RulePreviewLists({
	preview,
	issuersById,
	renderManualAction,
}: RulePreviewListsProps) {
	if (preview.skipped) {
		return (
			<output className="text-sm text-high">
				That pattern isn’t a valid regular expression — it will be skipped and
				match nothing.
			</output>
		);
	}

	return (
		<div className="flex flex-col gap-4">
			<PreviewList
				title="Will match"
				description="Currently-unmatched transactions this rule will claim."
				transactions={preview.willMatch}
				issuersById={issuersById}
			/>
			<PreviewList
				title="Will reassign"
				description="Transactions another issuer's rule owns that this rule will win."
				transactions={preview.willReassign}
				issuersById={issuersById}
			/>
			<PreviewList
				title="Manual collisions"
				description="Hand-assigned transactions matching this pattern — left untouched unless you remove their manual issuer."
				transactions={preview.manualCollisions}
				issuersById={issuersById}
				renderAction={renderManualAction}
			/>
		</div>
	);
}

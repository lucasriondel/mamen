import type { Issuer, Transaction } from "@mamen/shared/contract";
import { formatCurrency, formatShortDate } from "@/lib/format";

interface TransactionRowProps {
	transaction: Transaction;
	/** Issuer lookup for resolving a row's current issuer name. */
	issuersById: ReadonlyMap<number, Issuer>;
	/** Prefix shown before the current issuer name (e.g. `"→ "` in the rule preview). */
	issuerPrefix?: string;
	/** Rendered at the row's trailing edge (e.g. the remove-manual-issuer action). */
	action?: React.ReactNode;
}

/** One transaction line — date, raw string, current issuer, amount. */
function TransactionRow({
	transaction,
	issuersById,
	issuerPrefix = "",
	action,
}: TransactionRowProps) {
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
					{issuerPrefix}
					{currentIssuer.name}
				</span>
			) : null}
			<span className="shrink-0 tabular-nums text-muted">
				{formatCurrency(transaction.amount)}
			</span>
			{action}
		</li>
	);
}

export interface TransactionPreviewListProps {
	title: string;
	description: string;
	transactions: readonly Transaction[];
	issuersById: ReadonlyMap<number, Issuer>;
	/** Prefix shown before each row's current issuer name (e.g. `"→ "`). */
	issuerPrefix?: string;
	/** Per-row trailing action factory (used for the manual-collision list). */
	renderAction?: (transaction: Transaction) => React.ReactNode;
}

/** A titled, counted list of transactions — one section of a rule preview. */
export function TransactionPreviewList({
	title,
	description,
	transactions,
	issuersById,
	issuerPrefix,
	renderAction,
}: TransactionPreviewListProps) {
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
						<TransactionRow
							key={transaction.id}
							transaction={transaction}
							issuersById={issuersById}
							issuerPrefix={issuerPrefix}
							action={renderAction?.(transaction)}
						/>
					))}
				</ul>
			)}
		</section>
	);
}

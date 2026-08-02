import type { Category } from "@mamen/shared/contract";
import { Link } from "@tanstack/react-router";
import { TableCell, TableRow } from "@/components/ui/table";
import { CategoryCell } from "@/features/transactions/transaction-cells";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { IssuerAvatar } from "./issuer-avatar";
import type { IssuerMetrics } from "./issuer-sort";

export interface IssuersTableRowProps extends IssuerMetrics {
	/** The issuer's **issuer default category**, resolved by the caller. */
	category?: Category;
	/** That category's **Resolved colour**, resolved against the whole tree. */
	categoryColor?: string;
}

/**
 * One issuer row: avatar + name, its default category, transaction count, and
 * net €. Presentational — the metrics are derived once by {@link IssuersView} so
 * the sort and the cells share a single source of truth (issue #41), and the
 * category is looked up there too so the whole table costs one tree read rather
 * than one per row. `value` travels in the props but isn't rendered: it's what
 * the Net column *sorts* by, so it's derived alongside the figure it ranks.
 *
 * The name cell holds the `Link` rather than the whole row being clickable: a
 * real anchor keeps middle-click, ⌘-click and "copy link" working, which a
 * `role="link"` row handler cannot. The link's `after:` overlay stretches its
 * hit area across the row, so clicking anywhere still navigates.
 */
export function IssuersTableRow({
	issuer,
	count,
	net,
	category,
	categoryColor,
}: IssuersTableRowProps) {
	return (
		<TableRow className="group relative">
			<TableCell>
				<div className="flex items-center gap-3">
					<IssuerAvatar
						imageUrl={issuer.imageUrl}
						defaultCategoryId={issuer.defaultCategoryId}
						size="sm"
					/>
					<Link
						to="/issuers/$issuerId"
						params={{ issuerId: String(issuer.id) }}
						className="font-medium text-gousse-ink outline-none after:absolute after:inset-0 after:rounded-sm group-hover:text-gousse-accent focus-visible:after:ring-2 focus-visible:after:ring-gousse-accent"
					>
						{issuer.name}
					</Link>
				</div>
			</TableCell>
			<TableCell>
				{/* The issuer's *default* category — the chain's second rung. Shown
				    read-only here; it's edited on the issuer's own page. */}
				<CategoryCell category={category} color={categoryColor} />
			</TableCell>
			<TableCell className="text-right tabular-nums text-gousse-muted">
				{count}
			</TableCell>
			{/* The signed net, coloured by direction. The row is *ranked* by
			    `value` (the absolute money moved), which the Net header sorts by —
			    a separate column for it only repeated this figure unsigned. */}
			<TableCell
				className={cn(
					"text-right font-medium tabular-nums",
					net < 0 && "text-gousse-high",
					net > 0 && "text-gousse-low",
				)}
			>
				{formatCurrency(net)}
			</TableCell>
		</TableRow>
	);
}

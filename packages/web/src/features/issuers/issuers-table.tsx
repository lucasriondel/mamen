import type { Category } from "@mamen/shared/contract";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { IssuerMetrics, IssuerSort } from "./issuer-sort";
import { IssuersTableHead } from "./issuers-table-head";
import { IssuersTableRow } from "./issuers-table-row";

export interface IssuersTableProps {
  /** The issuers to show, already filtered and sorted by the view. */
  metrics: readonly IssuerMetrics[];
  sort: IssuerSort;
  onSortChange: (sort: IssuerSort) => void;
  /** Category lookup for the **issuer default category** column. */
  categoriesById: ReadonlyMap<number, Category>;
  /** Each category's **Resolved colour**, resolved once against the whole tree. */
  categoryColorById: ReadonlyMap<number, string>;
}

/**
 * The issuers data grid (columns **Issuer | Category | Excluded | Transactions
 * | Net**), on the same token-styled `Table` primitive as the transactions
 * grid — whose own recap column carries the same name, so the two read as one
 * question asked at two scales.
 *
 * Sorting is client-side and driven by the column headers: the whole issuer list
 * is already in memory (the view fetches it in one page to derive the count and
 * € figures), so a header click reorders without a refetch. The chosen key and
 * direction live in the URL, so the ordering is bookmarkable.
 */
export function IssuersTable({
  metrics,
  sort,
  onSortChange,
  categoriesById,
  categoryColorById,
}: IssuersTableProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gousse-line">
      <Table>
        <TableHeader>
          <TableRow>
            <IssuersTableHead
              sortKey="name"
              label="Issuer"
              sort={sort}
              onSortChange={onSortChange}
            />
            {/* Not a sort key: the default category is a label, and ranking
                by it would only group rows, in no obvious order. */}
            <TableHead>Category</TableHead>
            {/* Sortable, unlike Category: exclusion is a yes/no, so ranking by
                it gathers the issuers being held out of the totals into one
                block — the set worth auditing after a bulk sweep. */}
            <IssuersTableHead
              sortKey="recap"
              label="Excluded"
              sort={sort}
              onSortChange={onSortChange}
            />
            <IssuersTableHead
              sortKey="count"
              label="Transactions"
              sort={sort}
              onSortChange={onSortChange}
              align="right"
            />
            {/* One € column, not two: for most issuers the net is just the
                signed twin of the money moved, so showing both repeated the
                same figure. The cell shows the signed net (coloured by
                direction); the header ranks by `value`, the *absolute* money
                moved, so the busiest issuers surface together regardless of
                which way their money flowed. */}
            <IssuersTableHead
              sortKey="value"
              label="Net"
              sort={sort}
              onSortChange={onSortChange}
              align="right"
            />
          </TableRow>
        </TableHeader>
        <TableBody>
          {metrics.map((row) => {
            const category =
              row.issuer.defaultCategoryId != null
                ? categoriesById.get(row.issuer.defaultCategoryId)
                : undefined;
            return (
              <IssuersTableRow
                key={row.issuer.id}
                {...row}
                category={category}
                categoryColor={category != null ? categoryColorById.get(category.id) : undefined}
              />
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

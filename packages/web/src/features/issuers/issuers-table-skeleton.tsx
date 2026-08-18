import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * Placeholder widths for the table's four columns (**Issuer | Category |
 * Transactions | Net**), matching the settled table so the layout doesn't shift
 * when the rows arrive. `ml-auto` right-aligns the two numeric cells as the real
 * ones are.
 */
const COLUMNS = [
  { id: "issuer", head: "w-12", cell: "w-32" },
  { id: "category", head: "w-16", cell: "w-24" },
  { id: "count", head: "w-20 ml-auto", cell: "w-8 ml-auto" },
  { id: "net", head: "w-8 ml-auto", cell: "w-16 ml-auto" },
] as const;

export interface IssuersTableSkeletonProps {
  /** How many placeholder rows to draw. Defaults to a page-ish 8. */
  rows?: number;
}

/**
 * Loading shape for the issuers table: the header row plus `rows` placeholder
 * rows on the same `Table` primitive, so the pending and settled states share
 * their column rhythm and border treatment.
 */
export function IssuersTableSkeleton({ rows = 8 }: IssuersTableSkeletonProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gousse-line">
      <Table aria-busy="true">
        <caption className="sr-only">Loading issuers…</caption>
        <TableHeader>
          <TableRow>
            {COLUMNS.map((column) => (
              <TableHead key={column.id}>
                <Skeleton className={`h-3.5 ${column.head}`} />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: rows }, (_, index) => index).map((index) => (
            <TableRow key={index}>
              {COLUMNS.map((column) => (
                <TableCell key={column.id}>
                  {column.id === "issuer" ? (
                    <div className="flex items-center gap-3">
                      <Skeleton className="size-6 shrink-0 rounded-full" />
                      <Skeleton className={`h-4 ${column.cell}`} />
                    </div>
                  ) : (
                    <Skeleton className={`h-4 ${column.cell}`} />
                  )}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

import { formatMonth } from "@/lib/format";

/**
 * What this import is, in four facts, above the rows themselves: the format it
 * was read with, the account it is going to, the months it covers and how many
 * rows it will write.
 *
 * The counts are of the rows that will actually be **written**, so skipping the
 * only row of a month drops that month from here — what the commit does is what
 * the preview says. The line the filters carry ("Showing 2 of 4 rows") answers
 * the other question, what is on *screen*: a filtered-out row is hidden, not held
 * out, and commits.
 */
export function PreviewFacts({
  parserLabel,
  accountName,
  months,
  keptCount,
  totalCount,
  anySkipped,
}: {
  /** What the format that read these rows is called. */
  parserLabel: string;
  accountName: string;
  /** The months the kept rows fall in, as `YYYY-MM`. */
  months: readonly string[];
  /** How many rows the commit will write. */
  keptCount: number;
  /** How many the file parsed to in all. */
  totalCount: number;
  /** Whether any row was held out — decides whether the count is a fraction. */
  anySkipped: boolean;
}) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-2xl border border-gousse-line bg-gousse-panel p-4 text-sm sm:grid-cols-4">
      <Fact label="Format" value={parserLabel} />
      <Fact label="Account" value={accountName} />
      <Fact label="Months" value={months.map(formatMonth).join(", ")} />
      <Fact
        label="Rows"
        value={anySkipped ? `${keptCount} of ${totalCount}` : String(totalCount)}
      />
    </dl>
  );
}

/** One labelled fact in the preview summary grid. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-gousse-muted">{label}</dt>
      <dd className="font-medium text-gousse-ink">{value}</dd>
    </div>
  );
}

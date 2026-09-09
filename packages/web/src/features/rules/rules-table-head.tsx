/**
 * The rules table's column headers, in the **rule form's own order** —
 * account · pattern · direction · value — so the list and the editor's predicate
 * bar (`RulePredicateBar`) describe the same object left-to-right. Opening a rule
 * should feel like zooming into its row, not like re-reading it.
 *
 * `Owns` and the action column close the row: what the rule currently holds, and
 * what you can do to it.
 */
export function RulesTableHead() {
  return (
    <thead>
      <tr className="border-b border-gousse-line text-left">
        <Th className="w-[18%]">Account</Th>
        <Th className="w-[34%]">Pattern</Th>
        <Th className="w-[14%]">Direction</Th>
        <Th className="w-[12%] text-right">Value</Th>
        <Th className="w-[10%] text-right">Owns</Th>
        {/* The actions column's heading is for assistive tech only: a visible
            "Actions" would label a column whose icons already say what they do,
            but a nameless column header is a hole in the table's structure. */}
        <th scope="col" className="w-[12%]">
          <span className="sr-only">Actions</span>
        </th>
      </tr>
    </thead>
  );
}

function Th({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <th
      scope="col"
      className={`px-4 py-2.5 text-[10.5px] font-medium uppercase tracking-wider text-gousse-muted ${className ?? ""}`}
    >
      {children}
    </th>
  );
}

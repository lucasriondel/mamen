import type { ColumnMapping, SignRule, StatementFormat } from "@mamen/shared/contract";

/**
 * The columns a format's sign rule reads. Which ones they are depends on the
 * strategy — one signed column, a magnitude beside a direction, or a debit
 * column beside a credit one — which is exactly the distinction the closed union
 * exists to keep visible.
 */
const signColumns = (sign: SignRule): readonly string[] => {
  switch (sign.strategy) {
    case "signed-column":
      return [sign.amountColumn];
    case "direction-column":
      return [sign.amountColumn, sign.directionColumn];
    case "debit-credit-columns":
      return [sign.debitColumn, sign.creditColumn];
  }
};

/**
 * The columns the mapping names, skipping a counterparty IBAN this bank lacks.
 *
 * `rawIssuerString` is a *list* — banks routinely split what a human reads as
 * one label across a payee, a memo and a reference — so it is spread rather than
 * pushed, and every column feeding the issuer string is named here. They keep
 * the user's own assignment order, which is the order they are joined in.
 */
const mappedColumns = (mapping: ColumnMapping): readonly string[] => [
  mapping.date,
  ...mapping.rawIssuerString,
  ...(mapping.counterpartyIban === null ? [] : [mapping.counterpartyIban]),
];

/**
 * The columns a format actually **reads** — its mapping, its sign rule and its
 * row filter, in that order, deduplicated.
 *
 * This is what the formats list shows in place of a usage count, and it is
 * deliberately not the format's declared column list. The declared list is the
 * whole header row of the file it was built from, so on a bank that exports
 * twenty columns it says nothing about *this* format; what tells two formats on
 * one account apart is which columns each one goes looking for.
 *
 * Deduplicated because a strategy may name a column the mapping already named,
 * and a row repeating "Montant" twice reads as a mistake in the format rather
 * than as a format that reads one column for two purposes.
 */
export const readColumns = (format: StatementFormat): readonly string[] => {
  const filter = format.rules.filter;
  return [
    ...new Set([
      ...mappedColumns(format.mapping),
      ...signColumns(format.rules.sign),
      ...(filter === null ? [] : [filter.column]),
    ]),
  ];
};

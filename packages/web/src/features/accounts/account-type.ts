import type { Account } from "@mamen/shared/contract";

/** The four account-type literals the contract allows (see `AccountCreate`). */
export type AccountType = Account["type"];

/** Ordered `type` options for the create form, with their display labels. */
export const ACCOUNT_TYPE_OPTIONS: ReadonlyArray<{
	value: AccountType;
	label: string;
}> = [
	{ value: "checking", label: "Checking" },
	{ value: "savings", label: "Savings" },
	{ value: "credit_card", label: "Credit card" },
	{ value: "other", label: "Other" },
];

// Derived from the options above so the labels have a single source of truth.
const LABELS = Object.fromEntries(
	ACCOUNT_TYPE_OPTIONS.map((option) => [option.value, option.label]),
) as Record<AccountType, string>;

/** Human label for an account `type` literal (e.g. `credit_card` → `Credit card`). */
export function accountTypeLabel(type: AccountType): string {
	return LABELS[type] ?? type;
}

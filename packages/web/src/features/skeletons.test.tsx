import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountsListSkeleton } from "./accounts/accounts-list-skeleton";
import { CategoriesTreeSkeleton } from "./categories/categories-tree-skeleton";
import { IssuerDetailSkeleton } from "./issuers/issuer-detail-skeleton";
import { IssuersTableSkeleton } from "./issuers/issuers-table-skeleton";
import { RecapSkeleton } from "./recap/recap-skeleton";
import { RuleFormSkeleton } from "./rules/rule-form-skeleton";
import { RulePreviewSkeleton } from "./rules/rule-preview-skeleton";
import { RulesListSkeleton } from "./rules/rules-list-skeleton";
import { TransactionDetailSkeleton } from "./transactions/transaction-detail-skeleton";
import { TransactionsTableSkeleton } from "./transactions/transactions-table-skeleton";
import { TransferLegsSkeleton } from "./transactions/transfer-legs-skeleton";
import { TransfersListSkeleton } from "./transfers/transfers-list-skeleton";

/** Every loading shape in the app, with the props its call-sites pass. */
const SKELETONS: ReadonlyArray<[string, () => React.ReactElement]> = [
  ["AccountsListSkeleton", () => <AccountsListSkeleton />],
  ["CategoriesTreeSkeleton", () => <CategoriesTreeSkeleton />],
  ["IssuerDetailSkeleton", () => <IssuerDetailSkeleton />],
  ["IssuersTableSkeleton", () => <IssuersTableSkeleton />],
  ["RecapSkeleton", () => <RecapSkeleton />],
  ["RuleFormSkeleton", () => <RuleFormSkeleton />],
  ["RulePreviewSkeleton", () => <RulePreviewSkeleton label="Loading preview…" />],
  ["RulesListSkeleton", () => <RulesListSkeleton />],
  ["TransactionDetailSkeleton", () => <TransactionDetailSkeleton />],
  ["TransactionsTableSkeleton", () => <TransactionsTableSkeleton />],
  ["TransferLegsSkeleton", () => <TransferLegsSkeleton label="Loading legs…" />],
  ["TransfersListSkeleton", () => <TransfersListSkeleton />],
];

describe.each(SKELETONS)("%s", (_name, renderSkeleton) => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it("renders its placeholders without a React key warning", () => {
    render(renderSkeleton());

    const warnings = consoleError.mock.calls
      .map((call) => String(call[0]))
      .filter((message) => message.includes("same key"));

    expect(warnings).toEqual([]);
  });
});

/**
 * The source of every skeleton module, so the guard below can read the `key`
 * expressions the components are written with — a duplicate key is only
 * *observable* once two placeholders happen to share a width, and by then it is
 * already shipped.
 */
const SOURCES = import.meta.glob("./**/*-skeleton.tsx", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const KEY_EXPRESSION = /key=\{([^}]*)\}/g;

/**
 * What a placeholder may be keyed on: the array index (these lists are static,
 * never reordered and never keyed across a data change), or an entry's `id`
 * field naming the column it stands for.
 *
 * Anything else in these files is presentation — a Tailwind width class — and
 * two columns are allowed to be the same width, so keying on one is a
 * duplicate-key error waiting for the next edit.
 *
 * A bare `id` is deliberately *not* accepted: it would let any value pass by
 * renaming the binding, which is presentation wearing an identity's name. An
 * id has to be a field on the entry being rendered.
 *
 * A qualified index (`monthIndex`) counts as one: a skeleton with a list inside
 * a list cannot call both bindings `index`, and the suffix is what says the
 * value is still a position rather than a width that happens to be bound.
 */
const IDENTITY_KEY = /^([A-Za-z]*[Ii]ndex|[A-Za-z]+\.id)$/;

describe("skeleton keys", () => {
  it("covers every skeleton module in the app", () => {
    expect(Object.keys(SOURCES)).toHaveLength(SKELETONS.length);
  });

  it.each(Object.entries(SOURCES))("%s keys on identity", (_path, source) => {
    const expressions = [...source.matchAll(KEY_EXPRESSION)].map((match) => match[1]);

    for (const expression of expressions) {
      expect(expression).toMatch(IDENTITY_KEY);
    }
  });
});

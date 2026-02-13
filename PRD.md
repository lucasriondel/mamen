Transaction List Improvements Plan

Context

Five improvements to the transaction list: add an account column, remove "new merchant" badges, enable inline
category changing via popover, show merchant names when matched, and add a route-based detail side panel.

Execution Order

Changes 1-4 are done first (they're simpler column/UI changes). Change 5 (side view) is last since it
restructures routing.

---

Change 1: Remove "New" / "New Merchant" from Transaction Row ✅ DONE

Files modified:

- columns.tsx — removed NewMerchantBadge import, removed the render, removed createdAt from
  TransactionTableMeta
- index.tsx — removed createdAt from merchants map builder

---

Change 2: Show Merchant Name When Matched ✅ DONE

File: columns.tsx — rawMerchantString cell

- Matched (merchantInfo.name exists): MerchantAvatar + merchant name (font-medium) + raw string (text-xs muted,
  secondary context)
- Unmatched (no merchantInfo): only rawMerchantString, no avatar

---

Change 3: Add Account Column

Files:

- columns.tsx — update accountId column def with header: "Account" + cell renderer using
  meta.getAccountName(accountId). Add getAccountName to TransactionTableMeta
- index.tsx — build accountsMap from already-fetched accounts, create getAccountName callback, pass in
  tableMeta, remove columnVisibility: { accountId: false }, add header/cell width classes (w-24)

---

Change 4: Category Badge Click Opens Popover CategoryPicker

Files:

- columns.tsx — extract InlineCategoryCell component (needs useState for popover), wrap CategoryBadge in Popover

* CategoryPicker, e.stopPropagation() on trigger, on select call meta.onAssignCategory. Add onAssignCategory to
  TransactionTableMeta

- index.tsx — pass assignCategory (from useQuickCategoryAssign) as onAssignCategory in tableMeta

---

Change 5: Transaction Detail Side View (Route Outlet)

New files:

- routes/transactions.$transactionId.tsx — child route rendering TransactionDetailPanel
- features/transactions/components/TransactionDetailPanel/index.tsx — detail panel showing merchant info,
  amount, date, account, category, anomaly flags

Modified files:

- routes/transactions.tsx — add useMatch for $transactionId, render list + side panel outlet (w-[400px]
  border-l) horizontally when detail match exists
- TransactionDataTable/index.tsx — handleRowClick navigates to /transactions/$transactionId when no selection
  active

Post-creation: Run route codegen to update routeTree.gen.ts

---

Verification

1. Account column appears with account names
2. No "New" badges on merchant rows
3. Matched transactions show merchant name + dimmed raw string; unmatched show only raw string
4. Click category badge → popover with CategoryPicker → select → assignment works
5. Click transaction row → detail panel on right → URL changes to /transactions/:id
6. Click X in detail panel → panel closes, URL returns to /transactions

import type { Account, Category, Issuer, Transaction } from "@mamen/shared/contract";
import { Link } from "@tanstack/react-router";
import { BackLink } from "@/components/back-link";
import { PageLayout } from "@/components/page-layout";
import { formatCurrency, formatMonth, formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AnomalyFlags } from "./anomaly-flags";
import { AssignmentPicker } from "./assignment-picker";
import { BundleMembershipSection } from "./bundle-membership-section";
import { BundleSection } from "./bundle-section";
import { CategoryPicker } from "./category-picker";
import { DetailField } from "./detail-field";
import { IssuerPicker } from "./issuer-picker";
import { NotesPicker } from "./notes-picker";
import { RecapExclusionSection } from "./recap-exclusion-section";
import { TransferSection } from "./transfer-section";

/** Full date-time for the audit fields, where the day alone loses information. */
const DATE_TIME = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** A yes/no flag, rendered as a plain word (muted when false). */
function BoolField({ value }: { value: boolean }) {
  return <span className={cn(!value && "text-gousse-muted")}>{value ? "Yes" : "No"}</span>;
}

/**
 * The row's amount, the one number this surface is about — and, since issue
 * #129, a number at the end of a title row rather than a headline of its own. So
 * it is set like the other two title-row numbers (a category's total, a recap
 * line's) instead of the headline scale it wore when it had a line to itself —
 * beside a `text-2xl` title, a bigger number reads as the page's name. Exported
 * because the **detail panel** ends its own header with the same number.
 *
 * A `span`, not the `<output>` those two are: this is a field of the row, fixed
 * for as long as the page is open, not a total the filters recompute — there is
 * nothing here for a live region to announce.
 */
export function DetailAmount({ amount }: { amount: number }) {
  return (
    <span
      className={cn(
        "shrink-0 font-medium text-xl tabular-nums",
        amount < 0 && "text-gousse-high",
        amount > 0 && "text-gousse-low",
        amount === 0 && "text-gousse-ink",
      )}
    >
      {formatCurrency(amount)}
    </span>
  );
}

/** The core field list — id, date, amount, account, issuer/category, notes. */
function CoreFields({
  txn,
  account,
  issuer,
  category,
  categoryColor,
}: {
  txn: Transaction;
  account?: Account;
  issuer?: Issuer;
  category?: Category;
  categoryColor?: string;
}) {
  return (
    <dl className="rounded-2xl border border-gousse-line px-4">
      <DetailField label="Transaction ID">
        <span className="tabular-nums">{txn.id}</span>
      </DetailField>
      <DetailField label="Date">{formatShortDate(txn.date)}</DetailField>
      <DetailField label="Amount">
        <span
          className={cn(
            "font-medium tabular-nums",
            txn.amount < 0 && "text-gousse-high",
            txn.amount > 0 && "text-gousse-low",
          )}
        >
          {formatCurrency(txn.amount)}
        </span>
      </DetailField>
      <DetailField label="Account">
        {account?.name ?? (
          <span className="text-gousse-muted italic">Unknown (#{txn.accountId})</span>
        )}
      </DetailField>
      <DetailField label="Raw issuer text">
        <span className="break-words">{txn.rawIssuerString}</span>
      </DetailField>
      {/*
       * Issuer, category and notes are **edited here**, through the very
       * controls the grid's cells are (issue #72): the same pickers, the same
       * writes, the same manual/derived ink. A row reached from the list and a
       * row reached by link are the same row, so curating one shouldn't mean
       * going back to the table to find it — and a **bundle parent**, which is
       * only ever met on this page, would otherwise be the one row in the app
       * with no way to name what it is.
       */}
      <DetailField label="Issuer">
        {issuer ? (
          <IssuerPicker transaction={txn} issuer={issuer} />
        ) : (
          <AssignmentPicker
            transactionId={txn.id}
            rawIssuerString={txn.rawIssuerString}
            date={txn.date}
          />
        )}
      </DetailField>
      <DetailField label="Category">
        <CategoryPicker transaction={txn} category={category} color={categoryColor} />
      </DetailField>
      <DetailField label="Notes">
        <NotesPicker transaction={txn} />
      </DetailField>
    </dl>
  );
}

/** The refund + duplicate-exclusion fields for the row. */
function RefundDuplicateSection({
  txn,
  linkedRefund,
}: {
  txn: Transaction;
  linkedRefund?: Transaction;
}) {
  return (
    <div className="flex flex-col gap-3 border-t border-gousse-line pt-6">
      <h2 className="text-lg font-semibold text-gousse-ink">Refund &amp; duplicate</h2>
      <dl className="rounded-2xl border border-gousse-line px-4">
        <DetailField label="Is a refund">
          <BoolField value={txn.isRefund ?? false} />
        </DetailField>
        <DetailField label="Linked refund">
          {txn.linkedRefundId != null ? (
            <Link
              to="/transactions/$transactionId"
              params={{ transactionId: String(txn.linkedRefundId) }}
              className="text-gousse-accent hover:underline"
            >
              {linkedRefund
                ? `${formatShortDate(linkedRefund.date)} · ${formatCurrency(linkedRefund.amount)}`
                : `Transaction #${txn.linkedRefundId}`}
            </Link>
          ) : null}
        </DetailField>
        <DetailField label="Excluded as duplicate">
          <BoolField value={txn.isDuplicateExcluded ?? false} />
        </DetailField>
        <DetailField label="Duplicate note">
          {txn.duplicateNote?.trim() ? txn.duplicateNote : null}
        </DetailField>
      </dl>
    </div>
  );
}

/** The anomaly-flags section — a placeholder line when there are none. */
function AnomalyFlagsSection({ flags }: { flags: Transaction["anomalyFlags"] }) {
  const list = flags ?? [];
  return (
    <div className="flex flex-col gap-3 border-t border-gousse-line pt-6">
      <h2 className="text-lg font-semibold text-gousse-ink">Anomaly flags</h2>
      {list.length === 0 ? (
        <p className="text-sm text-gousse-muted italic">No anomaly flags.</p>
      ) : (
        <AnomalyFlags flags={list} />
      )}
    </div>
  );
}

/** The import provenance fields — month, timestamp, batch id. */
function ImportSection({ txn }: { txn: Transaction }) {
  return (
    <div className="flex flex-col gap-3 border-t border-gousse-line pt-6">
      <h2 className="text-lg font-semibold text-gousse-ink">Import</h2>
      <dl className="rounded-2xl border border-gousse-line px-4">
        <DetailField label="Import month">{formatMonth(txn.importMonth)}</DetailField>
        <DetailField label="Imported at">{DATE_TIME.format(txn.importedAt)}</DetailField>
        <DetailField label="Import batch">
          {txn.importBatchId ? (
            <span className="break-all tabular-nums">{txn.importBatchId}</span>
          ) : null}
        </DetailField>
      </dl>
    </div>
  );
}

interface TransactionDetailFieldsProps {
  transaction: Transaction;
  /** Resolved account for `accountId` (name lookup). */
  account?: Account;
  /** Resolved issuer for `issuerId`, if any. */
  issuer?: Issuer;
  /** Resolved derived category for `categoryId`, if any. */
  category?: Category;
  /** That category's **Resolved colour** (resolved against the whole tree). */
  categoryColor?: string;
  /** Resolved counterpart for `linkedRefundId`, if the row links a refund. */
  linkedRefund?: Transaction;
}

/**
 * Every field the app holds for one transaction, laid out as labelled rows —
 * the detail surface **below whatever chrome frames it**.
 *
 * Two things frame it (issue #154): the page at `/transactions/$transactionId`,
 * through {@link TransactionDetailContent} below, and the panel beside the grid.
 * They differ in their header and in nothing else, so the sections live here and
 * are rendered by both rather than forked — a panel that showed a *summary* and
 * linked out would reintroduce the page swap the panel exists to remove.
 *
 * The issuer, category and notes rows are the grid's own curation controls, so
 * the same manual/override/derived ink shows here as in the table; amounts
 * follow the app sign convention (debit red, credit green).
 */
export function TransactionDetailFields({
  transaction: txn,
  account,
  issuer,
  category,
  categoryColor,
  linkedRefund,
}: TransactionDetailFieldsProps) {
  return (
    <>
      <CoreFields
        txn={txn}
        account={account}
        issuer={issuer}
        category={category}
        categoryColor={categoryColor}
      />
      {/*
       * The two sides of a **bundle**, and a row is only ever one of them. A
       * **bundle parent** has members to stand for, a date of its own to
       * override and a bundle to dissolve (issues #72/#74); every other row has
       * a bundle to join or leave (#74). Both sit directly under the core
       * fields because membership is the rest of this row's identity, not an
       * aside like the refund/anomaly blocks.
       */}
      {txn.kind === "bundle" ? (
        <BundleSection transaction={txn} />
      ) : (
        <BundleMembershipSection transaction={txn} />
      )}
      <RefundDuplicateSection txn={txn} linkedRefund={linkedRefund} />
      <RecapExclusionSection transaction={txn} />
      <TransferSection transaction={txn} />
      <AnomalyFlagsSection flags={txn.anomalyFlags} />
      <ImportSection txn={txn} />
    </>
  );
}

/**
 * The resolved transaction detail **page** — {@link TransactionDetailFields}
 * under the topbar a page has. Split from {@link TransactionDetailPage} so that
 * component owns only the reads and this one is a pure render of the loaded row
 * plus its lookups.
 */
export function TransactionDetailContent({
  transaction: txn,
  account,
  issuer,
  category,
  categoryColor,
  linkedRefund,
}: TransactionDetailFieldsProps) {
  return (
    <PageLayout
      /*
       * Back, not a link to the list: the user came from some page of some
       * filtered view (global, a category's, an issuer's), and popping history
       * is the only thing that returns them to that exact spot.
       */
      back={<BackLink to="/transactions">Transactions</BackLink>}
      // The row's counterparty is what this page is *about*, so it is the
      // title — the raw bank string only while no issuer resolves it. The
      // amount moves to the far end of the same row, where every other
      // drill-down page (a category's, a recap line's) puts its number.
      title={issuer ? issuer.name : txn.rawIssuerString}
      description={formatShortDate(txn.date)}
      actions={<DetailAmount amount={txn.amount} />}
      className="gap-8"
    >
      <TransactionDetailFields
        transaction={txn}
        account={account}
        issuer={issuer}
        category={category}
        categoryColor={categoryColor}
        linkedRefund={linkedRefund}
      />
    </PageLayout>
  );
}

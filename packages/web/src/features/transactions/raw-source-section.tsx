import type { Transaction } from "@mamen/shared/contract";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { DetailField } from "./detail-field";

/**
 * The **raw source** block on the transaction detail surface (issue #177, ADR
 * 0012) — the original bank row, verbatim, as the bank wrote it.
 *
 * The first component in the app to render data it has **no schema for**: it
 * iterates whatever keys the row carries rather than reading known fields, so a
 * column mamen ignores today is readable the day it turns out to matter, with no
 * re-import. Keys are shown untranslated, in the provider's own language
 * (`Intitulé`, `Moyen de paiement`, `IBAN du tiers`) — a French header is
 * correct provenance, and renaming keys here would reintroduce exactly the
 * import-time guessing the archive exists to avoid.
 *
 * The heading is load-bearing, not decoration. Green-Got ships its own
 * `Catégorie`, which will sometimes disagree with mamen's **derived category**;
 * under the bank's name it reads as provenance, while a bare "Category" row
 * would read as a bug. It is never surfaced as a mamen field — the archive is
 * displayed *only* here, and nothing derives from it.
 *
 * Collapsed by default, because this is a dozen columns of reference material
 * and the fields the user curates every day come first. Absent entirely when
 * there is no raw source — a PDF-extracted row, or anything imported before the
 * archive existed — since an empty block would read as a broken page rather than
 * as "the bank said nothing".
 */
export function RawSourceSection({ transaction: txn }: { transaction: Transaction }) {
  const [open, setOpen] = useState(false);

  // Insertion order is the bank's column order, which papaparse preserves from
  // the header line: the row reads down the page the way it read across the CSV.
  const entries = Object.entries(txn.rawSource ?? {});
  if (entries.length === 0) return null;

  return (
    <section className="flex flex-col gap-3 border-t border-gousse-line pt-6">
      {/*
       * The heading *is* the trigger (an `h2` wrapping a `button`): the block has
       * one label and one thing to do with it, so a separate chevron beside a
       * plain heading would be a second target for the same action.
       */}
      <h2 className="text-lg font-semibold text-gousse-ink">
        <button
          type="button"
          onClick={() => setOpen((was) => !was)}
          aria-expanded={open}
          className="-mx-2 flex w-full items-center gap-2 rounded-xl px-2 py-1 text-left outline-none transition-colors hover:bg-gousse-ink/[0.035] focus-visible:ring-2 focus-visible:ring-gousse-accent"
        >
          <ChevronRight
            size={16}
            className={cn("shrink-0 text-gousse-muted transition-transform", open && "rotate-90")}
            aria-hidden
          />
          The bank's own words
          <span className="text-sm font-normal text-gousse-muted">
            {entries.length} {entries.length === 1 ? "column" : "columns"}
          </span>
        </button>
      </h2>

      {open ? (
        <>
          <p className="text-sm text-gousse-muted">
            The row exactly as your bank delivered it, in your bank's own words. mamen keeps every
            column, including the ones it doesn't use — and the ones it does read may look different
            here, because this is what was sent, not what mamen made of it.
          </p>
          <dl className="rounded-2xl border border-gousse-line px-4">
            {entries.map(([key, value]) => (
              // A column the bank sent empty is still a column it sent, so the
              // key stays and the value falls back to the field's own muted
              // em-dash rather than an empty row.
              <DetailField key={key} label={key}>
                {value === "" ? null : <span className="break-words">{value}</span>}
              </DetailField>
            ))}
          </dl>
        </>
      ) : null}
    </section>
  );
}

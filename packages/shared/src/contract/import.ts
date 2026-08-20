import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema, Multipart, OpenApi } from "@effect/platform";
import { Option, Schema } from "effect";
import { AiProviderNotConfigured, InvalidFileType, NotFound } from "./errors";
import { numFromStr, StatementFormatId } from "./ids";

/**
 * The PDF-upload size limit: 10 MiB. A bank statement is a handful of text
 * pages, so this is generous headroom, not a real ceiling. Enforced by the
 * multipart parser via `maxFileSize` (a breach yields a framework
 * `MultipartError`), matching the issuer image-upload pattern — there is no
 * `PersistedFile.size` field to check in the handler.
 */
export const MAX_PDF_BYTES = 10 * 1024 * 1024;

/**
 * A single **Extracted transaction** — one operation lifted from a PDF bank
 * statement, before any account/batch/month is stamped (that happens
 * client-side at commit; nothing the endpoint returns is keyed to an account,
 * even though since issue #185 it knows which one through the format it was
 * given). The field names and types mirror {@link Transaction}'s core so the
 * client can thread them straight into a `TransactionCreate` at commit:
 *
 * - `date` — the operation date (not the value date), decoded from the
 *   statement. Year is inferred from the statement header, since the per-row
 *   dates carry only day/month.
 * - `amount` — one **signed** euro amount, folding the statement's separate
 *   Débit / Crédit columns into a single number (Débit negative, Crédit
 *   positive). French number format (`1 929,71`) is parsed to `1929.71`.
 * - `rawIssuerString` — the merged operation label (multi-line descriptions
 *   collapse into one string), the raw text a Matching Rule later matches on.
 */
export class ExtractedTransaction extends Schema.Class<ExtractedTransaction>(
  "ExtractedTransaction",
)({
  date: Schema.Date,
  amount: Schema.Number,
  rawIssuerString: Schema.String,
}) {}

/**
 * The statement's own printed `TOTAL DES OPÉRATIONS` line, echoed back so the
 * client can later reconcile the extracted rows against what the bank declared.
 * Both are positive magnitudes (debit = sum of outflows, credit = sum of
 * inflows), exactly as printed — never a signed net.
 */
export class DeclaredTotals extends Schema.Class<DeclaredTotals>("DeclaredTotals")({
  debit: Schema.Number,
  credit: Schema.Number,
}) {}

/**
 * What extraction made of the **Statement Format** it was given (issue #188) —
 * the PDF counterpart of the CSV path's header fingerprint.
 *
 * A PDF format declares the columns a bank's statement carries, and the user
 * chooses which format reads a file. They can choose the wrong one, and until
 * this verdict existed nothing said so: the model was told to expect columns the
 * statement did not have and returned plausible rows anyway, which the user could
 * only catch by reading every line of **side-by-side validation** — after the
 * decision to import, rather than before it.
 *
 * - `matched` — whether the statement carried every column the format declares.
 * - `missingColumns` — the ones it did not, in the format's own spelling and
 *   order. Never a column the format does not declare: the field reports on the
 *   *expected* columns, so a name from anywhere else has nothing to say about the
 *   choice the user made.
 *
 * **Structured, not prose**, because the wizard *branches* on it: a mismatch
 * routes into building a format rather than on to validation. Prose would make
 * that branch a string match, and a model's sentence is not a stable API.
 *
 * The two fields cannot contradict one another — `matched` is `missingColumns`
 * being empty, folded server-side from what the model reported (`import/
 * extract.ts`). The model is asked only what it can see; the conclusion is
 * mamen's.
 */
export class FormatVerdict extends Schema.Class<FormatVerdict>("FormatVerdict")({
  matched: Schema.Boolean,
  missingColumns: Schema.Array(Schema.String),
}) {}

/**
 * Success payload for `extractPdf`: the candidate rows, the statement's declared
 * totals, and the {@link FormatVerdict} on the format the rows were read
 * against. No database write happened — these are candidates the user reviews
 * and commits from the web side (issue #45).
 *
 * A mismatched verdict still carries whatever rows the model managed to read:
 * the endpoint reports, and what to do about the wrong format is the wizard's
 * decision (issue #188).
 */
export class ExtractPdfResult extends Schema.Class<ExtractPdfResult>("ExtractPdfResult")({
  transactions: Schema.Array(ExtractedTransaction),
  declaredTotals: DeclaredTotals,
  verdict: FormatVerdict,
}) {}

/**
 * Extraction failed for any reason the server couldn't turn into a useful
 * client action. The whole `claude-code-effect` failure taxonomy (spawn /
 * invocation / API / parse / timeout / schema) collapses to this single tag —
 * the real cause is logged server-side; the client only learns extraction did
 * not produce a result and can offer a retry. A 502 (Bad Gateway): the failure
 * is in the upstream extraction step, not the request the client made.
 */
export class ExtractionFailed extends Schema.TaggedError<ExtractionFailed>()(
  "ExtractionFailed",
  {},
  HttpApiSchema.annotations({ status: 502 }),
) {}

/**
 * The multipart upload payload for `extractPdf`: the statement under `file`, and
 * under `formatId` the **Statement Format** to read it with (issue #185).
 *
 * The *id*, not the record. Which columns a bank's statement carries is the
 * account's own stored answer, so the server reads it back from the table rather
 * than believing a body that could declare any columns it liked — and it is that
 * read which makes the endpoint account-aware (ADR 0014). A multipart field
 * arrives as a string, hence `numFromStr`; a non-numeric one is a schema decode
 * failure → `HttpApiDecodeError (400)`, like any other malformed id.
 *
 * `maxFileSize` caps the file at {@link MAX_PDF_BYTES} and `maxParts` is 2 — the
 * file and the id, and nothing else. The `application/pdf` allow-list is NOT
 * expressible here — the handler enforces it and fails {@link InvalidFileType},
 * mirroring the issuer image upload. The derived client types this as
 * `FormData`.
 */
export const PdfUpload = HttpApiSchema.Multipart(
  Schema.Struct({
    file: Multipart.SingleFileSchema,
    formatId: numFromStr(StatementFormatId),
  }),
  {
    maxFileSize: Option.some(MAX_PDF_BYTES),
    maxParts: Option.some(2),
  },
);

/**
 * Import group, prefix `/import`. The server-side half of PDF import: a single
 * `POST /import/extract-pdf` takes a PDF bank statement **and the Statement
 * Format to read it with**, and returns candidate transactions with no database
 * write (ADR 0005 — extraction runs server-side).
 *
 * The endpoint is **no longer account-agnostic**, and that is a deliberate
 * reversal of what ADR 0005 decided rather than drift: a format belongs to one
 * account, so naming one names the account too. It is what lets the prompt say
 * which columns the statement carries instead of asking the model to work them
 * out (ADR 0014). What has *not* changed is the answer: still candidates keyed
 * to nothing, with the account, batch and month stamped client-side at commit.
 *
 * `extractPdf` declares {@link InvalidFileType} (non-PDF / oversize upload),
 * {@link NotFound} (no PDF format under that id — issue #185),
 * {@link ExtractionFailed} (the single client-visible collapse of the whole
 * extraction failure taxonomy) and {@link AiProviderNotConfigured} (issue #122 —
 * the one extraction failure the client can act on, held out of the collapse
 * precisely so it can be told apart from a retry-able one).
 */
export class ImportGroup extends HttpApiGroup.make("import")
  .add(
    HttpApiEndpoint.post("extractPdf")`/import/extract-pdf`
      .setPayload(PdfUpload)
      .addSuccess(ExtractPdfResult)
      .addError(InvalidFileType)
      .addError(NotFound)
      .addError(ExtractionFailed)
      .addError(AiProviderNotConfigured),
  )
  .annotateContext(OpenApi.annotations({ title: "Import" })) {}

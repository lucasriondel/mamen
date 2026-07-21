import {
	HttpApiEndpoint,
	HttpApiGroup,
	HttpApiSchema,
	Multipart,
	OpenApi,
} from "@effect/platform";
import { Option, Schema } from "effect";
import { InvalidFileType } from "./errors";

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
 * client-side at commit; this endpoint is account-agnostic). The field names
 * and types mirror {@link Transaction}'s core so the client can thread them
 * straight into a `TransactionCreate` at commit:
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
export class DeclaredTotals extends Schema.Class<DeclaredTotals>(
	"DeclaredTotals",
)({
	debit: Schema.Number,
	credit: Schema.Number,
}) {}

/**
 * Success payload for `extractPdf`: the candidate rows plus the statement's
 * declared totals. No database write happened — these are candidates the user
 * reviews and commits from the web side (issue #45).
 */
export class ExtractPdfResult extends Schema.Class<ExtractPdfResult>(
	"ExtractPdfResult",
)({
	transactions: Schema.Array(ExtractedTransaction),
	declaredTotals: DeclaredTotals,
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
 * The multipart upload payload for `extractPdf`. One file under the key `file`;
 * `maxFileSize` caps it at {@link MAX_PDF_BYTES} and `maxParts` at 1. The
 * `application/pdf` allow-list is NOT expressible here — the handler enforces it
 * and fails {@link InvalidFileType}, mirroring the issuer image upload. The
 * derived client types this as `FormData`.
 */
export const PdfUpload = HttpApiSchema.Multipart(
	Schema.Struct({ file: Multipart.SingleFileSchema }),
	{
		maxFileSize: Option.some(MAX_PDF_BYTES),
		maxParts: Option.some(1),
	},
);

/**
 * Import group, prefix `/import`. The server-side half of PDF import: a single
 * `POST /import/extract-pdf` takes a PDF bank statement and returns candidate
 * transactions with no database write (ADR 0005 — extraction runs server-side).
 * The endpoint is **account-agnostic**: it takes only the file; the account,
 * import batch, and month are stamped client-side at commit.
 *
 * `extractPdf` declares {@link InvalidFileType} (non-PDF / oversize upload) and
 * {@link ExtractionFailed} (the single client-visible collapse of the whole
 * extraction failure taxonomy).
 */
export class ImportGroup extends HttpApiGroup.make("import")
	.add(
		HttpApiEndpoint.post("extractPdf")`/import/extract-pdf`
			.setPayload(PdfUpload)
			.addSuccess(ExtractPdfResult)
			.addError(InvalidFileType)
			.addError(ExtractionFailed),
	)
	.annotateContext(OpenApi.annotations({ title: "Import" })) {}

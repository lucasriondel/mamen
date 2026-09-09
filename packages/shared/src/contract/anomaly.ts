import { Schema } from "effect";

/**
 * The anomaly kinds a transaction can be flagged with. The first three were
 * ported verbatim from the existing `AnomalyType` union in `@mamen/shared/types`
 * — the contract owns the Effect-Schema form; the plain TS type stays for the
 * legacy code paths, and the two lists are kept in step.
 *
 * `non-negative-bundle` (issue #76) is the first flag the server itself raises:
 * a **bundle** is a cost told in several rows, so its members sum to a debit;
 * summing to zero or to a credit usually means a member was added by mistake or
 * a refund counted twice. Like every anomaly it *warns* — the parent's amount
 * stays whatever its members say.
 */
export const AnomalyType = Schema.Literal(
  "high-amount",
  "new-issuer",
  "potential-duplicate",
  "non-negative-bundle",
);
export type AnomalyType = typeof AnomalyType.Type;

/**
 * A single anomaly flag attached to a transaction. Ported from the legacy
 * `AnomalyFlag` type: `detectedAt`/`dismissedAt` stay opaque strings (they are
 * stored as-is inside the JSON `anomalyFlags` column, never surfaced as a query
 * bound), the two optional fields use `Schema.optional` (absent, not null). The
 * whole array lives JSON-encoded in one TEXT column — the repository parses /
 * stringifies it at the storage boundary.
 */
export class AnomalyFlag extends Schema.Class<AnomalyFlag>("AnomalyFlag")({
  type: AnomalyType,
  reason: Schema.String,
  detectedAt: Schema.String,
  dismissed: Schema.Boolean,
  dismissedAt: Schema.optional(Schema.String),
  linkedTransactionId: Schema.optional(Schema.Number),
}) {}

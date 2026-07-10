import { Schema } from "effect";

/**
 * The anomaly kinds a transaction can be flagged with. Ported verbatim from the
 * existing `AnomalyType` union in `@mamen/shared/types` — the contract owns the
 * Effect-Schema form; the plain TS type stays for the legacy code paths.
 */
export const AnomalyType = Schema.Literal(
	"high-amount",
	"new-issuer",
	"potential-duplicate",
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

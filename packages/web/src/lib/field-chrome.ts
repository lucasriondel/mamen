/**
 * The chrome gousse's form fields share — border, background, inset, and the
 * folded focus treatment. Vendored from the registry as {@link Textarea}'s own
 * dependency (issue #93), so the names below are gousse's: mamen has no
 * `Select` primitive, and its local `Input` is a shadcn gap-fill that keeps its
 * own chrome (`bg-gousse-bg`, its own focus ring) rather than reading
 * {@link FIELD_CHROME}. It does read {@link FIELD_PILL} (issue #97): the shape
 * is the one part of the contract both primitive systems have to agree on, so
 * it is shared rather than copied.
 */
export const FIELD_CHROME =
	"border border-gousse-line bg-gousse-panel px-4 py-1.5 text-sm text-gousse-ink focus:border-gousse-ink focus:outline-hidden";

/**
 * Radius for single-line fields ({@link Input}, {@link Select}). Split out from
 * {@link FIELD_CHROME} so {@link Textarea}, whose multi-line box would look
 * broken as a pill, can share the chrome without inheriting the shape.
 */
export const FIELD_PILL = "rounded-full";

/**
 * Radius for multi-line fields ({@link Textarea}). Generous, but a corner
 * rather than a pill.
 */
export const FIELD_BOX = "rounded-2xl";

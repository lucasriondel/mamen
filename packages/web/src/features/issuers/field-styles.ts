/**
 * Shared Tailwind class string for the secondary "back" link the issuer and
 * transaction detail pages dress as a button, from one source.
 *
 * The matching `INPUT_CLASS` is gone: the text fields it dressed now use the
 * `Input` primitive (`@/components/ui/input`), which owns that visual plus the
 * focus/disabled/invalid states this constant never had.
 */
export const BUTTON_CLASS =
	"rounded-md border border-line px-3 py-1.5 text-sm text-ink disabled:opacity-50";

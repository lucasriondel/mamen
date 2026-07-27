/**
 * Shared Tailwind class string for the secondary "back" link the issuer and
 * transaction detail pages dress as a button, from one source.
 *
 * The matching `INPUT_CLASS` is gone *from this file*: the issuer text fields it
 * dressed now use the `Input` primitive (`@/components/ui/input`), which owns
 * that visual plus the focus/disabled/invalid states this constant never had.
 * Other features still declare their own copy — see the primitive's docstring
 * for what remains to migrate.
 */
export const BUTTON_CLASS =
	"rounded-md border border-gousse-line px-3 py-1.5 text-sm text-gousse-ink disabled:opacity-50";

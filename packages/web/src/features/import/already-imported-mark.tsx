/**
 * The per-row **already imported** mark (issue #89) — shown on a previewed row
 * whose date, amount and normalised raw issuer string all match a row already
 * stored on that account and month (`flagDuplicates`).
 *
 * Informational, and nothing more: the row still commits. It reads as a word
 * rather than as a colour alone, so the mark survives a screen reader and a
 * monochrome eye; the tint is `medium` (attention), not `high` (loss), because
 * committing it costs one delete, not any data.
 *
 * One component for both preview paths — the CSV table and the PDF side-by-side
 * rows — so a row cannot be marked one way in one preview and another way in the
 * other.
 */
export function AlreadyImportedMark() {
	return (
		<span className="whitespace-nowrap rounded-full border border-gousse-medium/40 bg-gousse-medium/10 px-2 py-0.5 text-[11px] text-gousse-medium">
			Already imported
		</span>
	);
}

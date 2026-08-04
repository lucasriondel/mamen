import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * The `<input type="date">` value for a stored date, and back.
 *
 * Both go through **UTC**, deliberately: the app stores `date` as an ISO string
 * and compares it lexicographically, and a bundle parent's date is copied
 * verbatim from a member's. Reading the local calendar day instead would shift
 * a row a day either side of midnight depending on where the reader sits, and
 * saving would then write a date nobody typed.
 */
const toDateInputValue = (date: Date) => date.toISOString().slice(0, 10);
const fromDateInputValue = (value: string) =>
	new Date(`${value}T00:00:00.000Z`);

export type BundleDateFormProps = {
	/** The parent's stored date — the value the field is a draft over. */
	date: Date;
	/** Whether that date is the user's own, which is what the copy below says. */
	manualDate: boolean;
	/** True while any write on the bundle is in flight. */
	disabled: boolean;
	/** Save the drafted date. `manualDate` is the mutation's to add, not this form's. */
	onSave: (date: Date) => void;
};

/**
 * The **bundle date** field (issue #72): a bundle's date defaults to its
 * earliest member's — the cost belongs to when the money was spent, not to when
 * the last person settled up — and this is where that default is overridden. A
 * weekend away is dated the Friday even when a refund lands three weeks on.
 *
 * The field is a draft over the stored value, re-seeded *during render* whenever
 * that value changes: after the user's own save, and after a recompute moves the
 * derived date (#74). Without the re-seed the field would keep showing a date
 * the row no longer has, and "Save" would read as a no-op while actually writing
 * the stale one back.
 *
 * Saving an unchanged date is refused for the same reason it would be pointless:
 * the write's whole effect is the `manualDate` flag riding with it, and pinning
 * a date the user never touched is not something they asked for.
 */
export function BundleDateForm({
	date,
	manualDate,
	disabled,
	onSave,
}: BundleDateFormProps) {
	const storedDate = toDateInputValue(date);
	const [draftDate, setDraftDate] = useState(storedDate);
	const [seededFrom, setSeededFrom] = useState(storedDate);
	if (seededFrom !== storedDate) {
		setSeededFrom(storedDate);
		setDraftDate(storedDate);
	}

	const unchanged = draftDate === "" || draftDate === storedDate;

	return (
		<>
			<form
				className="flex flex-wrap items-end gap-2"
				onSubmit={(event) => {
					event.preventDefault();
					if (disabled || unchanged) return;
					onSave(fromDateInputValue(draftDate));
				}}
			>
				<label className="flex flex-col gap-1 text-gousse-muted text-xs">
					Bundle date
					<Input
						type="date"
						aria-label="Bundle date"
						className="h-9 w-44 bg-gousse-bg"
						value={draftDate}
						onChange={(event) => setDraftDate(event.target.value)}
					/>
				</label>
				<Button type="submit" size="sm" disabled={disabled || unchanged}>
					Save date
				</Button>
			</form>

			<p className="text-xs text-gousse-muted">
				{manualDate
					? "This date was set by hand, and stays put when members are added or removed."
					: "This date follows its earliest member. Set one here to pin it instead."}
			</p>
		</>
	);
}

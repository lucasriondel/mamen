import { Button } from "@/components/ui/button";
import type { ParsedTransaction } from "./parsers/types";
import { useImportCommit } from "./use-import-commit";

/**
 * The shared foot of both preview paths (CSV plain table and PDF side-by-side):
 * the Commit / Back buttons. Both sources converge on the same commit rail, so
 * this is the single place that owns the commit action.
 *
 * It carries no warning any more (issue #88). It used to show two per-month
 * notices — how many existing rows the commit would replace, and how many
 * **bundles** it would dissolve — because committing deleted the account's month
 * before inserting. A commit only ever adds now, so both notices described a
 * loss that cannot happen, and a warning about an impossible loss teaches the
 * user to fear an import that is safe. The reads behind them went with them; the
 * bar asks the server nothing before writing.
 */
export function CommitBar({
	records,
	onBack,
}: {
	records: readonly ParsedTransaction[];
	onBack: () => void;
}) {
	const commit = useImportCommit();

	return (
		<div className="flex items-center gap-3">
			<Button
				variant="primary"
				size="md"
				onClick={() => commit.mutate({ records })}
				disabled={commit.isPending}
			>
				{commit.isPending ? "Importing…" : "Commit import"}
			</Button>
			<Button
				variant="secondary"
				size="md"
				onClick={onBack}
				disabled={commit.isPending}
			>
				Back
			</Button>
		</div>
	);
}

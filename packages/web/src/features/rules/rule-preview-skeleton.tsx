import { Skeleton, SkeletonScreen } from "@/components/ui/skeleton";

/** One preview line: date, raw string, current issuer, amount. */
function PreviewRowSkeleton() {
	return (
		<li className="flex items-center gap-2 py-1.5">
			<Skeleton className="h-3.5 w-14 shrink-0" />
			<Skeleton className="h-3.5 min-w-0 flex-1" />
			<Skeleton className="h-3.5 w-24 shrink-0" />
			<Skeleton className="h-3.5 w-16 shrink-0" />
		</li>
	);
}

/** A titled section of the preview, mirroring {@link TransactionPreviewList}. */
function PreviewSectionSkeleton({ rows }: { rows: number }) {
	return (
		<section className="flex flex-col gap-1">
			<Skeleton className="h-3.5 w-32" />
			<Skeleton className="h-3 w-56" />
			<ul className="divide-y divide-gousse-line">
				{Array.from({ length: rows }, (_, index) => index).map((index) => (
					<PreviewRowSkeleton key={index} />
				))}
			</ul>
		</section>
	);
}

export interface RulePreviewSkeletonProps {
	/**
	 * What the wait is about, for assistive tech — the rule form previews a
	 * pattern's effect, while the delete confirm previews the consequences of
	 * removing a rule.
	 */
	label: string;
}

/**
 * Loading shape for a Matching Rule preview — the titled, counted transaction
 * lists shown inside the scroll box on both the rule form and the delete
 * confirm. Two sections, since both call-sites render at least two.
 */
export function RulePreviewSkeleton({ label }: RulePreviewSkeletonProps) {
	return (
		<SkeletonScreen label={label} className="flex flex-col gap-4">
			<PreviewSectionSkeleton rows={3} />
			<PreviewSectionSkeleton rows={2} />
		</SkeletonScreen>
	);
}

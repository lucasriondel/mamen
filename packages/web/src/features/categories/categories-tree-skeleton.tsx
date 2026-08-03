import { Skeleton, SkeletonScreen } from "@/components/ui/skeleton";

/** A leaf row: colour chip + name on the left, its controls on the right. */
function LeafSkeleton({ nameWidth }: { nameWidth: string }) {
	return (
		<div className="flex items-center justify-between gap-2 rounded-lg border border-gousse-line bg-gousse-panel px-4 py-2">
			<div className="flex min-w-0 items-center gap-1.5">
				<Skeleton className="size-4 shrink-0 rounded-full" />
				<Skeleton className={`h-3.5 ${nameWidth}`} />
			</div>
			<Skeleton className="h-7 w-28" />
		</div>
	);
}

/**
 * A folder: heading + total, its controls, then a left-ruled list of leaves —
 * the same nesting as the settled tree, so the indentation is already in place
 * before the categories land.
 */
function FolderSkeleton({ leaves }: { leaves: readonly string[] }) {
	return (
		<div className="rounded-lg border border-gousse-line bg-gousse-panel p-4">
			<div className="flex w-full items-center justify-between gap-2">
				<div className="flex min-w-0 items-center gap-1.5">
					<Skeleton className="size-4 shrink-0 rounded-full" />
					<Skeleton className="h-4 w-32" />
				</div>
				<Skeleton className="h-4 w-20" />
			</div>

			<div className="mt-3">
				<Skeleton className="h-7 w-40" />
			</div>

			<ul className="mt-3 flex flex-col gap-2 border-gousse-line border-l pl-3">
				{leaves.map((width, index) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: a static placeholder list — never reordered, and two leaves may share a width
					<li key={index}>
						<LeafSkeleton nameWidth={width} />
					</li>
				))}
			</ul>
		</div>
	);
}

/** Two folders of differing size, so the placeholder tree isn't suspiciously regular. */
const FOLDERS = [
	["w-28", "w-36", "w-24"],
	["w-32", "w-20"],
] as const;

/** Loading shape for the category tree — folders with nested leaves. */
export function CategoriesTreeSkeleton() {
	return (
		<SkeletonScreen label="Loading categories…" className="flex flex-col gap-6">
			{FOLDERS.map((leaves, index) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: a static placeholder list — never reordered, and two folders may hold the same widths
				<FolderSkeleton key={index} leaves={leaves} />
			))}
		</SkeletonScreen>
	);
}

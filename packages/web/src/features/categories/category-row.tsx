import type { Category } from "@mamen/shared/contract";
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import {
	type Appearance,
	AppearancePicker,
} from "@/components/appearance-picker";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * How far each level is pushed in, and how deep the tint goes.
 *
 * Indent is linear until it isn't: past {@link MAX_TINT_DEPTH} both the padding
 * and the tint stop stepping, so a pathological twelve-deep branch stays inside
 * its card instead of walking the amount column off the right edge. Depth is
 * read from a `depth` prop threaded through the existing recursion — the
 * recursion itself is unchanged (ADR 0003 still decides folder vs leaf by
 * childlessness).
 */
const ROOT_PAD = 12;
const STEP = 22;
const MAX_TINT_DEPTH = 3;

/** The left inset for a row at this depth, in px. */
export function indentFor(depth: number): number {
	return ROOT_PAD + STEP * Math.min(depth, MAX_TINT_DEPTH + 2);
}

/**
 * Nesting reads as a **tint**, not as ladder rules. An earlier pass drew one
 * vertical guide per ancestor level; against the row dividers they turned the
 * card into graph paper. A background that steps a few percent per level says
 * the same thing at the edge of vision and survives being ignored.
 */
const DEPTH_TINT = [
	"",
	"bg-gousse-ink/[0.022] hover:bg-gousse-ink/[0.06] focus-within:bg-gousse-ink/[0.06]",
	"bg-gousse-ink/[0.044] hover:bg-gousse-ink/[0.082] focus-within:bg-gousse-ink/[0.082]",
	"bg-gousse-ink/[0.066] hover:bg-gousse-ink/[0.104] focus-within:bg-gousse-ink/[0.104]",
] as const;

function tintFor(depth: number): string {
	return DEPTH_TINT[Math.min(depth, MAX_TINT_DEPTH)] ?? "";
}

export interface CategoryRowProps {
	node: Category;
	depth: number;
	/** The node's **Resolved colour** (ADR 0006) — what the icon and swatch paint. */
	color: string;
	/** A folder's rolled-up **Category total**, or a leaf's own net. */
	total: number;
	/**
	 * This row's share of its parent's total, `0`–`1`, or `null` when there is
	 * nothing to compare against (a root, or a parent that nets to zero).
	 */
	share: number | null;
	/** How many children hang off this node; `0` renders no disclosure control. */
	childCount: number;
	expanded: boolean;
	onToggle: () => void;
	/**
	 * Store this node's **appearance** — its **Icon name** and its colour, `null`
	 * for "resume inheriting" — as one write (issues #58, #130).
	 */
	onAppearance: (appearance: Appearance) => void;
	/** A styling write is in flight. */
	styling: boolean;
	/** The `⋯` cluster — passed in so the row shell stays free of mutations. */
	actions: ReactNode;
}

/**
 * One row of the category tree, at any depth — the single shell a folder and a
 * leaf both render through, so the two kinds cannot drift apart.
 *
 * What each row now carries that it didn't:
 *
 * - **A disclosure control**, but only where there are children. A leaf keeps
 *   the slot as an invisible spacer, so every icon in a card sits on one
 *   vertical line no matter the depth.
 * - **Its own amount.** Only folders used to show a total; a leaf row was pure
 *   chrome, which is a strange thing for the row that actually holds the money.
 * - **A share bar** against its parent, which is what makes "where does it go?"
 *   answerable without reading four numbers and dividing.
 * - **A chosen/inherited distinction on the swatch.** `color: null` is a
 *   *reference* under ADR 0006, so a filled dot means the node chose a colour
 *   and a hollow ring means it is borrowing one. The data was always there; the
 *   row simply never said which.
 */
export function CategoryRow({
	node,
	depth,
	color,
	total,
	share,
	childCount,
	expanded,
	onToggle,
	onAppearance,
	styling,
	actions,
}: CategoryRowProps) {
	const isRoot = depth === 0;
	const isFolder = childCount > 0;

	return (
		<div
			style={{ paddingLeft: indentFor(depth) }}
			className={cn(
				"group/row flex items-center gap-2 pr-3 transition-colors",
				isRoot ? "min-h-[50px]" : "min-h-[42px]",
				tintFor(depth),
				!isRoot &&
					"hover:bg-gousse-ink/[0.035] focus-within:bg-gousse-ink/[0.035]",
				isRoot &&
					"hover:bg-gousse-ink/[0.035] focus-within:bg-gousse-ink/[0.035]",
			)}
		>
			{isFolder ? (
				<button
					type="button"
					onClick={onToggle}
					aria-expanded={expanded}
					aria-label={`${expanded ? "Collapse" : "Expand"} ${node.name}`}
					className="flex size-5 shrink-0 items-center justify-center rounded-full text-gousse-muted outline-none transition-colors hover:bg-gousse-line/60 hover:text-gousse-ink focus-visible:ring-2 focus-visible:ring-gousse-accent"
				>
					{/* 13px at stroke 2 — a chevron any larger reads as a tick once it
					    rotates into the expanded state. */}
					<ChevronRight
						className={cn(
							"size-[13px] transition-transform duration-150",
							expanded && "rotate-90",
						)}
						aria-hidden
					/>
				</button>
			) : (
				<span className="size-5 shrink-0" aria-hidden />
			)}

			<CategoryRowIdentity
				node={node}
				color={color}
				depth={depth}
				isFolder={isFolder}
				styling={styling}
				onAppearance={onAppearance}
			/>

			{isFolder && (
				<span className="shrink-0 rounded-full border border-gousse-line px-1.5 text-[11px] text-gousse-muted leading-[18px]">
					{childCount}
				</span>
			)}

			<span className="min-w-2 flex-1" />

			{/* Fixed width, so every number in a card lands on the same right edge. */}
			<span
				aria-hidden
				className="hidden h-1 w-[72px] shrink-0 overflow-hidden rounded-full bg-gousse-line sm:block"
			>
				{share !== null && share > 0 && (
					<span
						className="block h-full rounded-full"
						style={{
							width: `${Math.min(100, share * 100)}%`,
							backgroundColor: color,
						}}
					/>
				)}
			</span>

			<output
				aria-label={`${node.name} total`}
				className={cn(
					"w-[92px] shrink-0 text-right tabular-nums",
					isRoot ? "font-medium text-sm" : "text-[13px]",
					total < 0 && "text-gousse-high",
					total > 0 && "text-gousse-low",
					total === 0 && "text-gousse-muted",
				)}
			>
				{formatCurrency(total)}
			</output>

			{/* The space is always reserved and only the opacity moves, so revealing
			    the actions never shifts a number sideways. Coarse pointers have no
			    hover to wait for, so they keep them on. */}
			<div className="flex w-[64px] shrink-0 justify-end opacity-0 transition-opacity group-hover/row:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100">
				{actions}
			</div>
		</div>
	);
}

/**
 * A node's identity: its **appearance** chip and a link to its transactions
 * (issue #25).
 *
 * The chip is the **editor** for what it shows (issues #58, #130) — click the
 * icon to change the icon *and* the colour, which used to be two triggers two
 * pixels apart — which is why it sits *outside* the link: nesting a button
 * inside an anchor is invalid, and one gesture can't mean both "navigate" and
 * "edit".
 *
 * It paints the **Resolved colour**, never the stored `color`, so a leaf that
 * inherits visibly tracks the folder above it and a folder recolour repaints its
 * whole subtree on the next read (ADR 0006).
 */
function CategoryRowIdentity({
	node,
	color,
	depth,
	isFolder,
	styling,
	onAppearance,
}: {
	node: Category;
	color: string;
	depth: number;
	isFolder: boolean;
	styling: boolean;
	onAppearance: (appearance: Appearance) => void;
}) {
	return (
		<span className="flex min-w-0 items-center gap-1.5">
			<AppearancePicker
				label={node.name}
				icon={node.icon}
				color={node.color}
				resolved={color}
				pending={styling}
				onSubmit={onAppearance}
			/>
			<Link
				to="/categories/$categoryId"
				params={{ categoryId: String(node.id) }}
				className={cn(
					"min-w-0 truncate text-gousse-ink hover:text-gousse-accent",
					depth === 0 && "font-semibold text-[15px] tracking-tight",
					depth > 0 && isFolder && "font-medium text-sm",
					depth > 0 && !isFolder && "text-sm",
				)}
			>
				{node.name}
			</Link>
		</span>
	);
}

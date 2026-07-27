import { useVirtualizer } from "@tanstack/react-virtual";
import type { IconName } from "lucide-react/dynamic";
import {
	type KeyboardEvent,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { CategoryIcon, ICON_NAMES } from "@/components/category-icon";
import { Input } from "@/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** Cells per row, and the height of one row in px — the grid is uniform. */
const COLUMNS = 6;
const ROW_HEIGHT = 40;
/** The scroll box's height (`h-60`) in px — fixed, so the grid can seed its rect. */
const GRID_HEIGHT = 240;

/**
 * Candidates for a query, matched on the Lucide id itself. The id *is* the
 * searchable text (ADR 0006): `shopping-cart` is what a user types and what the
 * row stores, so there is no separate label to index. Hyphens are ignored on the
 * query side so "shoppingcart" and "shopping cart" both land.
 */
export function filterIconNames(query: string): readonly IconName[] {
	const needle = query
		.trim()
		.toLowerCase()
		.replace(/[\s-]+/g, "");
	if (needle.length === 0) return ICON_NAMES;
	return ICON_NAMES.filter((name) => name.replace(/-/g, "").includes(needle));
}

export interface IconPickerProps {
	/** The thing being re-iconed — names the trigger, e.g. "Change Food icon". */
	label: string;
	/** The category's current **Icon name**, drawn on the trigger. */
	value: string;
	/** Its **Resolved colour**, so the trigger matches the row it sits on. */
	color: string;
	/** A write is in flight; the grid stays open but won't fire a second one. */
	pending?: boolean;
	onSelect: (icon: IconName) => void;
	className?: string;
}

/**
 * The **Icon name** picker for a category, opened by clicking the icon it edits
 * (issue #58). A popover holding a filter field over Lucide's whole set and a
 * grid of candidates.
 *
 * Two costs are avoided deliberately, because ~1,600 candidates make both real:
 * the grid is **virtualised**, so the DOM holds one screenful of cells rather
 * than 1,600 buttons; and each cell draws through {@link CategoryIcon}, whose
 * registry is a map of `() => import()` thunks, so only the glyphs actually on
 * screen are ever fetched. Scrolling or filtering fetches the newly visible ones
 * and nothing else.
 *
 * Keyboard: the field takes focus on open, `ArrowDown` steps into the grid, and
 * the arrows walk it in two dimensions with a roving `tabIndex` — one tab stop
 * for the whole grid, not one per cell. Escape dismisses (Radix).
 *
 * Icons belong to **categories only** (ADR 0006) — an Issuer never gets one
 * directly, it inherits through its default category — so this takes a category's
 * fields rather than a generic entity.
 */
export function IconPicker({
	label,
	value,
	color,
	pending,
	onSelect,
	className,
}: IconPickerProps) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	/** Which cell the roving `tabIndex` sits on. */
	const [active, setActive] = useState(0);
	/**
	 * The cell to *move focus to* after the next render, or `null` for "leave
	 * focus alone". Separate from {@link active} because that also resets when the
	 * query changes — which must not yank focus out of the field being typed in.
	 */
	const [focusIndex, setFocusIndex] = useState<number | null>(null);

	const scrollRef = useRef<HTMLDivElement>(null);
	const gridRef = useRef<HTMLFieldSetElement>(null);

	const matches = useMemo(() => filterIconNames(query), [query]);
	const rowCount = Math.ceil(matches.length / COLUMNS);

	const virtualizer = useVirtualizer({
		count: rowCount,
		getScrollElement: () => scrollRef.current,
		estimateSize: () => ROW_HEIGHT,
		overscan: 4,
		// The scroll box is a fixed `h-60`, so its size is known before it is
		// measured. Seeding it means the first paint already shows a full window
		// instead of an empty box that fills in a frame later.
		initialRect: { width: 288, height: GRID_HEIGHT },
	});

	// Move focus only when a key asked for it, and only once the target cell has
	// actually been rendered — an off-screen row is scrolled into range first, so
	// the element may not exist until the pass after `scrollToIndex`.
	useEffect(() => {
		if (focusIndex === null) return;
		const cell = gridRef.current?.querySelector<HTMLElement>(
			`[data-icon-index="${focusIndex}"]`,
		);
		if (cell === null || cell === undefined) return;
		cell.focus();
		setFocusIndex(null);
	}, [focusIndex]);

	const handleOpenChange = (next: boolean) => {
		setOpen(next);
		if (next) {
			setQuery("");
			setActive(0);
			setFocusIndex(null);
		}
	};

	const focusCell = (index: number) => {
		const clamped = Math.max(0, Math.min(index, matches.length - 1));
		setActive(clamped);
		virtualizer.scrollToIndex(Math.floor(clamped / COLUMNS));
		setFocusIndex(clamped);
	};

	const handleGridKeyDown = (event: KeyboardEvent<HTMLFieldSetElement>) => {
		const step =
			event.key === "ArrowRight"
				? 1
				: event.key === "ArrowLeft"
					? -1
					: event.key === "ArrowDown"
						? COLUMNS
						: event.key === "ArrowUp"
							? -COLUMNS
							: null;
		if (step === null) {
			if (event.key === "Home") {
				event.preventDefault();
				focusCell(0);
			} else if (event.key === "End") {
				event.preventDefault();
				focusCell(matches.length - 1);
			}
			return;
		}
		event.preventDefault();
		focusCell(active + step);
	};

	const pick = (name: IconName) => {
		if (pending) return;
		onSelect(name);
		setOpen(false);
	};

	return (
		<Popover open={open} onOpenChange={handleOpenChange}>
			<PopoverTrigger asChild>
				<button
					type="button"
					aria-label={`Change ${label} icon`}
					title={`Change ${label} icon`}
					className={cn(
						"shrink-0 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-gousse-accent focus-visible:ring-offset-1 focus-visible:ring-offset-gousse-panel",
						className,
					)}
				>
					<CategoryIcon name={value} color={color} />
				</button>
			</PopoverTrigger>
			<PopoverContent className="w-72 p-2">
				<Input
					value={query}
					onChange={(e) => {
						setQuery(e.target.value);
						setActive(0);
					}}
					onKeyDown={(e) => {
						// Down out of the field is the way into the grid — otherwise the
						// only route to a cell is the mouse.
						if (e.key === "ArrowDown" && matches.length > 0) {
							e.preventDefault();
							focusCell(active);
						}
					}}
					placeholder="Search icons…"
					aria-label="Search icons"
					spellCheck={false}
					autoComplete="off"
					// The popover exists to filter this list, so it opens ready to be typed
					// into — the alternative is a gesture that only gets you to the field.
					autoFocus
				/>
				{matches.length === 0 ? (
					<p className="px-2 py-6 text-center text-gousse-muted text-sm">
						No icons match “{query.trim()}”.
					</p>
				) : (
					<div
						ref={scrollRef}
						className="mt-2 h-60 overflow-y-auto overscroll-contain"
					>
						{/*
						 * A `fieldset` rather than a `div role="group"`: the grouping is
						 * native, so the role and its name need no ARIA, and the cells are
						 * real controls. The arrow keys are routed from the container
						 * because the roving `tabIndex` means only one cell is focusable at
						 * a time — a handler per cell would be 1,600 identical closures.
						 */}
						<fieldset
							ref={gridRef}
							aria-label="Icons"
							onKeyDown={handleGridKeyDown}
							style={{
								height: virtualizer.getTotalSize(),
								position: "relative",
							}}
						>
							{virtualizer.getVirtualItems().map((row) => (
								<div
									key={row.key}
									className="absolute inset-x-0 flex"
									style={{
										height: row.size,
										transform: `translateY(${row.start}px)`,
									}}
								>
									{matches
										.slice(row.index * COLUMNS, row.index * COLUMNS + COLUMNS)
										.map((name, column) => {
											const index = row.index * COLUMNS + column;
											return (
												<button
													key={name}
													type="button"
													data-icon-index={index}
													// Roving tabIndex: the grid is one tab stop, not 1,600.
													tabIndex={index === active ? 0 : -1}
													aria-label={name}
													aria-pressed={name === value}
													title={name}
													disabled={pending}
													onFocus={() => setActive(index)}
													onClick={() => pick(name)}
													className={cn(
														"flex flex-1 items-center justify-center rounded-md outline-none",
														"hover:bg-gousse-bg focus-visible:ring-2 focus-visible:ring-gousse-accent",
														name === value && "bg-gousse-bg",
													)}
												>
													<CategoryIcon
														name={name}
														color={name === value ? color : undefined}
														size={18}
													/>
												</button>
											);
										})}
								</div>
							))}
						</fieldset>
					</div>
				)}
			</PopoverContent>
		</Popover>
	);
}

import type { LucideIcon } from "lucide-react";
import { Shapes } from "lucide-react";
import { dynamicIconImports, type IconName } from "lucide-react/dynamic";
import { useEffect, useReducer } from "react";
import { cn } from "@/lib/utils";

/**
 * The **Icon name** → component registry (ADR 0006, issue #55). A category's
 * `icon` holds a Lucide id in kebab-case (`shopping-cart`) — Lucide's own
 * canonical key, which survives export renames and is what the picker searches —
 * so every site that used to render `{category.icon}` as emoji text renders this
 * instead.
 *
 * `lucide-react/dynamic`'s thunk map *is* the registry: ~1,900 ids, each mapped
 * to a `() => import()` of that one icon. Only the id an actual category names is
 * ever fetched, so the glyph data — the bulk of the library — stays out of the
 * bundle. The map itself does not: it is a static import, so the ids and their
 * thunks ship in the entry chunk (~110 KB raw) and the bundler emits a chunk per
 * icon. That is the price of resolving an arbitrary stored id lazily, and it buys
 * the picker (issue #59) its full candidate list.
 */

/**
 * Every id the registry knows, as a set — the thunk map is an object keyed by id,
 * so membership is the whole validity test, done once at module load rather than
 * per render.
 */
const KNOWN_ICON_NAMES: ReadonlySet<string> = new Set<string>(
	Object.keys(dynamicIconImports),
);

/**
 * Every id the registry knows, sorted — the picker's candidate list (issue #58).
 * Sorted once here rather than per keystroke: the array is ~1,600 entries and the
 * filter re-runs on every character typed.
 */
export const ICON_NAMES: readonly IconName[] = Object.keys(dynamicIconImports)
	.sort()
	.map((name) => name as IconName);

/** Is this string an id the registry can resolve? */
export function isIconName(name: string): name is IconName {
	return KNOWN_ICON_NAMES.has(name);
}

/**
 * Icons already fetched, kept for the session. A category's icon repeats across
 * the tree, the pickers and the recap, and the pickers remount on every open —
 * without this each mount re-awaits the same module and flashes the placeholder
 * again even though the browser has it.
 */
const resolved = new Map<IconName, LucideIcon>();
/**
 * Ids whose chunk *failed*. A stale deploy or an offline tab rejects the import,
 * and that is exactly the "does not resolve" the fallback glyph exists for — it
 * is recorded rather than retried on every render, so the row degrades to the
 * glyph instead of sitting on an empty box forever.
 */
const unresolvable = new Set<IconName>();
/** In-flight fetches, so N rows sharing an icon share one import. */
const inFlight = new Map<IconName, Promise<void>>();

function load(name: IconName): Promise<void> {
	const existing = inFlight.get(name);
	if (existing !== undefined) return existing;
	const promise = dynamicIconImports[name]()
		.then((module) => {
			resolved.set(name, module.default);
		})
		.catch(() => {
			unresolvable.add(name);
		})
		.finally(() => {
			inFlight.delete(name);
		});
	inFlight.set(name, promise);
	return promise;
}

type Resolution =
	| { status: "loading" }
	| { status: "ready"; Icon: LucideIcon }
	| { status: "unresolvable" };

/**
 * What we can draw for this name *right now*. Read from the module caches rather
 * than held in state: they only ever move loading → ready/unresolvable, so a
 * render can trust them, and a name already fetched paints on its first render.
 */
function resolutionOf(name: string): Resolution {
	if (!isIconName(name)) return { status: "unresolvable" };
	const Icon = resolved.get(name);
	if (Icon !== undefined) return { status: "ready", Icon };
	if (unresolvable.has(name)) return { status: "unresolvable" };
	return { status: "loading" };
}

export interface CategoryIconProps {
	/** The category's **Icon name** — any string; an unresolvable one degrades. */
	name: string;
	/** The category's **Resolved colour**; omitted → `currentColor`. */
	color?: string;
	size?: number;
	className?: string;
}

/**
 * A category's icon, drawn in its **Resolved colour**.
 *
 * A name that does not resolve renders the {@link Shapes} fallback glyph rather
 * than a blank, so a bad value degrades instead of leaving a hole in a row. Two
 * things fail to resolve and both land there: a name outside the registry — a
 * hand-typed emoji the migration's translation table didn't cover, or an id from
 * a future Lucide — which is caught synchronously by a set lookup, so it costs no
 * fetch; and a known id whose chunk *fetch* rejects, which is why this owns the
 * import rather than delegating to `DynamicIcon` (that swallows the rejection and
 * would leave the loading placeholder up permanently).
 *
 * Only the window where a real chunk is genuinely in flight gets the same-size
 * empty placeholder: reserving the box keeps the row from reflowing, and showing
 * *no* glyph for a tick beats flashing the wrong one.
 */
export function CategoryIcon({
	name,
	color,
	size = 16,
	className,
}: CategoryIconProps) {
	const resolution = resolutionOf(name);
	const [, rerender] = useReducer((n: number) => n + 1, 0);

	useEffect(() => {
		if (!isIconName(name) || resolution.status !== "loading") return;
		let live = true;
		void load(name).then(() => {
			if (live) rerender();
		});
		return () => {
			live = false;
		};
	}, [name, resolution.status]);

	const shared = {
		size,
		color,
		className: cn("shrink-0", className),
		"aria-hidden": true,
	} as const;

	if (resolution.status === "unresolvable") {
		return <Shapes {...shared} data-category-icon="fallback" />;
	}
	if (resolution.status === "loading") {
		return (
			<span
				aria-hidden
				className="inline-block shrink-0"
				style={{ width: size, height: size }}
			/>
		);
	}
	return <resolution.Icon {...shared} data-category-icon={name} />;
}

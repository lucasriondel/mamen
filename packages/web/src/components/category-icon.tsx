import { Shapes } from "lucide-react";
import { DynamicIcon, type IconName, iconNames } from "lucide-react/dynamic";
import { cn } from "@/lib/utils";

/**
 * The **Icon name** → component registry (ADR 0006, issue #55). A category's
 * `icon` holds a Lucide id in kebab-case (`shopping-cart`) — Lucide's own
 * canonical key, which survives export renames and is what the picker searches —
 * so every site that used to render `{category.icon}` as emoji text renders this
 * instead.
 *
 * `lucide-react/dynamic` *is* the registry: it carries the ~1,900 ids plus one
 * `() => import()` thunk each, and `DynamicIcon` fetches only the id it is asked
 * for. The render path therefore never pulls the icon library into the bundle —
 * an icon costs a chunk, not a library.
 */

/**
 * Every id the registry knows, as a set — the thunk map is an object keyed by id,
 * so membership is the whole validity test, done once at module load rather than
 * per render.
 */
const KNOWN_ICON_NAMES: ReadonlySet<string> = new Set<string>(iconNames);

/** Is this string an id the registry can resolve? */
export function isIconName(name: string): name is IconName {
	return KNOWN_ICON_NAMES.has(name);
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
 * An unresolvable name — a hand-typed emoji the migration's translation table
 * didn't cover, or an id from a future Lucide — renders the {@link Shapes}
 * fallback glyph rather than a blank, so a bad value degrades instead of leaving
 * a hole in a row. The check is a synchronous set lookup, so a bad name costs no
 * fetch and logs nothing; only real ids reach `DynamicIcon`.
 *
 * While a real icon's chunk is in flight `DynamicIcon` has nothing to draw. It
 * gets a same-size empty placeholder rather than the fallback glyph: reserving
 * the box keeps the row from reflowing, and showing *no* glyph beats flashing the
 * wrong one.
 */
export function CategoryIcon({
	name,
	color,
	size = 16,
	className,
}: CategoryIconProps) {
	const shared = {
		size,
		color,
		className: cn("shrink-0", className),
		"aria-hidden": true,
	} as const;

	if (!isIconName(name)) {
		return <Shapes {...shared} data-category-icon="fallback" />;
	}
	return (
		<DynamicIcon
			{...shared}
			name={name}
			data-category-icon={name}
			fallback={() => (
				<span
					aria-hidden
					className="inline-block shrink-0"
					style={{ width: size, height: size }}
				/>
			)}
		/>
	);
}

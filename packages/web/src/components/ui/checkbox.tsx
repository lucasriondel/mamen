import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * Styled native checkbox — gousse's `Checkbox`, vendored from the registry
 * (issue #93) and owned here. Alone among the four it never carried a local
 * adapter, so it is gousse's source unedited: the standard checkbox chrome
 * (h-4 w-4 rounded, gousse accent fill, focus:ring-gousse-accent) folded onto a
 * raw `<input type="checkbox">`.
 *
 * The accessible name stays in the consuming composite — mamen's two call-sites
 * (the transactions grid's selection column and the **Excluded** cell) both
 * pass an `aria-label` describing the row, since a per-row box has no visible
 * label of its own. `className` extends/overrides via cn().
 */
export function Checkbox({
	className,
	...props
}: Omit<ComponentProps<"input">, "type">) {
	return (
		<input
			type="checkbox"
			className={cn(
				"h-4 w-4 cursor-pointer rounded border-gousse-line text-gousse-accent focus:ring-gousse-accent",
				className,
			)}
			{...props}
		/>
	);
}

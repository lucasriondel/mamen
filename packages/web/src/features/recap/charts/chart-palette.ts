/**
 * The recap charts' colour contract (issue #113).
 *
 * gousse ships no categorical ramp — its palette is surfaces (`bg`/`panel`/
 * `ink`/`line`), one accent, and the three **status** steps (`high`/`medium`/
 * `low`). Status colours are reserved: they mean good/warning/critical, so
 * spending them on "series 4" would make a colour that means *bad* land on
 * whichever category happened to sort fourth. The charts therefore bring their
 * own categorical hues, declared here and painted through CSS custom properties
 * so the light/dark pair swaps in one place (`chart-palette.css`).
 *
 * The eight hues are the validated default of the data-viz method, checked
 * against **mamen's own surfaces** rather than adopted on trust — `#ffffff`
 * (`--gousse-panel`, light) and `#171716` (dark). Both modes clear the lightness
 * band, the chroma floor, adjacent-pair CVD separation (worst ΔE 9.1 light / 8.4
 * dark, target ≥ 8) and the normal-vision floor (19.6 / 19.3, floor ≥ 15). Three
 * light-mode hues sit under 3:1 against white, which obliges **relief**: every
 * chart here ships a legend and direct labels, and the recap's own sorted lists
 * carry the exact figures, so identity is never colour-alone.
 *
 * Two rules the charts must not break:
 *
 * - **Fixed order, never cycled.** A ninth series is not a generated hue — it
 *   folds into an "Other" bucket ({@link CATEGORICAL_SLOTS} is the ceiling).
 * - **Colour follows the entity, not its rank** — see {@link seriesColorFor}.
 */

/** How many categorical hues exist. Past this, series fold into "Other". */
export const CATEGORICAL_SLOTS = 8;

/**
 * The categorical slots, as CSS variables resolved per theme in
 * `chart-palette.css`. Indexed 0–7 in the validated order — the order *is* the
 * CVD-safety mechanism, so it must not be re-sorted for aesthetics.
 */
export const CATEGORICAL_VARS: readonly string[] = Array.from(
  { length: CATEGORICAL_SLOTS },
  (_, i) => `var(--chart-series-${i + 1})`,
);

/** The neutral the "Other" bucket and de-emphasised marks wear. */
export const OTHER_COLOR = "var(--chart-other)";

/**
 * The two **diverging** poles of the earnings-vs-spending chart. Money in and
 * money out are opposites, so they get a cool/warm pair (blue ↔ red) around the
 * zero baseline rather than two categorical slots — two cool hues would stop the
 * baseline reading as "nothing". Never the status ramp: earning is not "good"
 * and spending is not "critical", they are only directions.
 */
export const EARNED_COLOR = "var(--chart-earned)";
export const SPENT_COLOR = "var(--chart-spent)";

/** Recessive chrome — grid lines and axes, one shade off the surface. */
export const GRID_COLOR = "var(--chart-grid)";
/** Axis tick / label ink. Text wears text tokens, never a series colour. */
export const AXIS_COLOR = "var(--chart-axis)";

/**
 * The colour a series wears, by its **stable identity** — never by its position
 * in the current sort.
 *
 * `slot` must be derived from something about the entity that does not move when
 * the data does (its id's position in a fixed ordering of the whole set), so
 * filtering a period out cannot repaint the survivors: a reader who learned
 * "Groceries is blue" must not find it orange next month because a bigger
 * category dropped away. Callers past {@link CATEGORICAL_SLOTS} pass `null` for
 * the "Other" bucket rather than wrapping around, since a generated ninth hue is
 * indistinguishable from an existing one under CVD.
 */
export function seriesColorFor(slot: number | null): string {
  if (slot === null || slot < 0 || slot >= CATEGORICAL_SLOTS) return OTHER_COLOR;
  return CATEGORICAL_VARS[slot] as string;
}

/**
 * Assign stable colour slots across a set of bucket keys.
 *
 * The keys are ordered **as given** — callers hand them in the order the data
 * ranks them *once*, and the map is then reused for every subsequent render of
 * the same set, which is what keeps a hue attached to its entity. Everything
 * past the eighth key maps to `null` (the "Other" neutral).
 */
export function assignColorSlots(keys: readonly string[]): ReadonlyMap<string, number | null> {
  const slots = new Map<string, number | null>();
  keys.forEach((key, index) => {
    slots.set(key, index < CATEGORICAL_SLOTS ? index : null);
  });
  return slots;
}

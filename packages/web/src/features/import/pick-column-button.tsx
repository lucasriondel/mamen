import type { Ref } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type ColumnField, COLUMN_FIELD_BADGE } from "./column-fields";

/**
 * The control that puts the file pane into **pick mode** for one field (issue
 * #214) — beside the single-column selects and beside the label's column list,
 * where it was spelled out twice identically.
 *
 * A toggle, said as one: the name stays put and `aria-pressed` carries the state,
 * so the way out of pick mode is the control that opened it. Named for the field
 * it fills rather than for the word on it, since every one of them says the same
 * word and a screen reader would otherwise hear "Pick" seven times over.
 */
export function PickColumnButton({
  field,
  isPicking,
  onClick,
  ref,
}: {
  /** The field whose column the next header click answers. */
  field: ColumnField;
  isPicking: boolean;
  onClick: () => void;
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <Button
      ref={ref}
      variant="secondary"
      size="sm"
      aria-pressed={isPicking}
      aria-label={`Pick the ${COLUMN_FIELD_BADGE[field]} column from the file`}
      className={cn("shrink-0", isPicking && "border-gousse-accent text-gousse-accent")}
      onClick={onClick}
    >
      Pick
    </Button>
  );
}

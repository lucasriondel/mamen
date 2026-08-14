// The plan the planning agent produces, and the schema that validates it.
//
// Phase 1 of every flow ends with the planner emitting a JSON block inside
// <plan> tags. `Output.object` extracts it and validates it against
// `planSchema`, so a malformed plan aborts the run instead of silently
// producing garbage branch names downstream.
//
// We use Zod here, but any Standard Schema validator works just as well —
// Valibot, ArkType, etc. See https://standardschema.dev.

import { z } from "zod";

export const planSchema = z.object({
	issues: z.array(
		z.object({ id: z.string(), title: z.string(), branch: z.string() }),
	),
});

/** A single unblocked issue the planner selected for this iteration. */
export type PlannedIssue = z.infer<typeof planSchema>["issues"][number];

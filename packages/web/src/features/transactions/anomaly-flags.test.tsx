import type { AnomalyFlag } from "@mamen/shared/contract";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AnomalyFlags } from "./anomaly-flags";

/** A flag as the server writes it — the array field is plain data, no id. */
const flag = (over: Partial<AnomalyFlag> = {}): AnomalyFlag =>
	({
		type: "high-amount",
		reason: "8× this issuer's usual",
		detectedAt: "2026-03-01T00:00:00.000Z",
		dismissed: false,
		...over,
	}) as AnomalyFlag;

describe("AnomalyFlags", () => {
	it("names every flag kind, so none renders label-less", () => {
		render(
			<AnomalyFlags
				flags={[
					flag(),
					flag({ type: "new-issuer" }),
					flag({ type: "potential-duplicate" }),
					flag({ type: "non-negative-bundle" }),
				]}
			/>,
		);
		expect(screen.getByText("High amount")).toBeInTheDocument();
		expect(screen.getByText("New issuer")).toBeInTheDocument();
		expect(screen.getByText("Potential duplicate")).toBeInTheDocument();
		expect(screen.getByText("Bundle is not a cost")).toBeInTheDocument();
	});

	// The **non-negative bundle** flag (issue #76) is the one the server raises
	// itself, and it is a warning: it says what to go and look at, and the card
	// carries no control that would change the bundle's sum.
	it("shows the non-negative bundle warning and its reason", () => {
		const { container } = render(
			<AnomalyFlags
				flags={[
					flag({
						type: "non-negative-bundle",
						reason:
							"This bundle's members sum to zero or more, so it is not a cost.",
					}),
				]}
			/>,
		);
		expect(screen.getByText("Bundle is not a cost")).toBeInTheDocument();
		expect(screen.getByText(/sum to zero or more/i)).toBeInTheDocument();
		expect(container.querySelectorAll("button")).toHaveLength(0);
	});

	it("tags a dismissed flag rather than dropping it", () => {
		render(
			<AnomalyFlags
				flags={[flag({ type: "non-negative-bundle", dismissed: true })]}
			/>,
		);
		expect(screen.getByText("Dismissed")).toBeInTheDocument();
	});
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Empty } from "./empty";

/**
 * The empty state's contract, pinned before the primitive was vendored (issue
 * #93): the icon slot above the title and the action below the copy were an
 * adapter's doing and are now the component's own.
 */
describe("Empty", () => {
	it("renders the title, the description and the action", () => {
		render(
			<Empty title="No transfers detected" description="Nothing here yet.">
				<a href="/import">Import a statement</a>
			</Empty>,
		);

		expect(screen.getByText("No transfers detected")).toBeInTheDocument();
		expect(screen.getByText("Nothing here yet.")).toBeInTheDocument();
		expect(
			screen.getByRole("link", { name: "Import a statement" }),
		).toBeInTheDocument();
	});

	it("renders the action below the copy", () => {
		render(
			<Empty title="No transfers detected" description="Nothing here yet.">
				<a href="/import">Import a statement</a>
			</Empty>,
		);

		const description = screen.getByText("Nothing here yet.");
		const action = screen.getByRole("link", { name: "Import a statement" });
		expect(
			description.compareDocumentPosition(action) &
				Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy();
	});

	it("renders an optional icon above the title", () => {
		render(
			<Empty
				icon={<svg role="img" aria-label="transfers" />}
				title="No transfers detected"
			/>,
		);

		const icon = screen.getByRole("img", { name: "transfers" });
		const title = screen.getByText("No transfers detected");
		expect(
			icon.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy();
	});

	it("renders neither slot when given neither", () => {
		const { container } = render(<Empty title="No categories yet" />);

		expect(container.querySelectorAll("svg")).toHaveLength(0);
		expect(screen.queryByRole("link")).not.toBeInTheDocument();
	});

	it("takes gousse's dashed border by default and a solid one on request", () => {
		const { container, rerender } = render(<Empty title="No categories yet" />);
		expect(container.querySelector("div")?.className).toContain(
			"border-dashed",
		);

		rerender(<Empty title="All caught up" variant="solid" />);
		expect(container.querySelector("div")?.className).not.toContain(
			"border-dashed",
		);
	});

	it("merges a call-site class onto the panel", () => {
		const { container } = render(
			<Empty title="No categories yet" className="mt-8" />,
		);

		expect(container.querySelector("div")?.className).toContain("mt-8");
	});
});

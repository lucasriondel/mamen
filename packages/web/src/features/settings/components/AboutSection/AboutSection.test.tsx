import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AboutSection } from "./index";

describe("AboutSection", () => {
	it("displays version from APP_VERSION", () => {
		render(<AboutSection />);
		expect(screen.getByText("0.1.0")).toBeInTheDocument();
	});

	it("displays build date", () => {
		render(<AboutSection />);
		expect(screen.getByText("2026-02-09")).toBeInTheDocument();
	});

	it("renders documentation link with correct attributes", () => {
		render(<AboutSection />);
		const docLink = screen.getByText("Documentation");
		expect(docLink).toHaveAttribute("target", "_blank");
		expect(docLink).toHaveAttribute("rel", "noopener noreferrer");
	});

	it("renders report issue link with correct attributes", () => {
		render(<AboutSection />);
		const issueLink = screen.getByText("Report an issue");
		expect(issueLink).toHaveAttribute("target", "_blank");
		expect(issueLink).toHaveAttribute("rel", "noopener noreferrer");
	});
});

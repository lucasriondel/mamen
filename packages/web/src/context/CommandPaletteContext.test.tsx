import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
	CommandPaletteProvider,
	useCommandPalette,
} from "./CommandPaletteContext";

const TestConsumer = (): React.ReactElement => {
	const { isOpen, open, close, toggle } = useCommandPalette();
	return (
		<div>
			<span data-testid="status">{isOpen ? "open" : "closed"}</span>
			<button onClick={open}>Open</button>
			<button onClick={close}>Close</button>
			<button onClick={toggle}>Toggle</button>
		</div>
	);
};

describe("CommandPaletteContext", () => {
	it("provides isOpen as false by default", () => {
		render(
			<CommandPaletteProvider>
				<TestConsumer />
			</CommandPaletteProvider>,
		);

		expect(screen.getByTestId("status")).toHaveTextContent("closed");
	});

	it("open() sets isOpen to true", async () => {
		const user = userEvent.setup();
		render(
			<CommandPaletteProvider>
				<TestConsumer />
			</CommandPaletteProvider>,
		);

		await user.click(screen.getByText("Open"));
		expect(screen.getByTestId("status")).toHaveTextContent("open");
	});

	it("close() sets isOpen to false", async () => {
		const user = userEvent.setup();
		render(
			<CommandPaletteProvider>
				<TestConsumer />
			</CommandPaletteProvider>,
		);

		await user.click(screen.getByText("Open"));
		expect(screen.getByTestId("status")).toHaveTextContent("open");

		await user.click(screen.getByText("Close"));
		expect(screen.getByTestId("status")).toHaveTextContent("closed");
	});

	it("toggle() switches isOpen state", async () => {
		const user = userEvent.setup();
		render(
			<CommandPaletteProvider>
				<TestConsumer />
			</CommandPaletteProvider>,
		);

		await user.click(screen.getByText("Toggle"));
		expect(screen.getByTestId("status")).toHaveTextContent("open");

		await user.click(screen.getByText("Toggle"));
		expect(screen.getByTestId("status")).toHaveTextContent("closed");
	});

	it("Ctrl+K toggles the palette", async () => {
		const user = userEvent.setup();
		render(
			<CommandPaletteProvider>
				<TestConsumer />
			</CommandPaletteProvider>,
		);

		await user.keyboard("{Control>}k{/Control}");
		expect(screen.getByTestId("status")).toHaveTextContent("open");

		await user.keyboard("{Control>}k{/Control}");
		expect(screen.getByTestId("status")).toHaveTextContent("closed");
	});

	it("Meta+K toggles the palette", async () => {
		const user = userEvent.setup();
		render(
			<CommandPaletteProvider>
				<TestConsumer />
			</CommandPaletteProvider>,
		);

		await user.keyboard("{Meta>}k{/Meta}");
		expect(screen.getByTestId("status")).toHaveTextContent("open");
	});

	it("restores focus on close", async () => {
		const user = userEvent.setup();
		render(
			<CommandPaletteProvider>
				<TestConsumer />
				<button data-testid="focus-target">Focus Me</button>
			</CommandPaletteProvider>,
		);

		const focusTarget = screen.getByTestId("focus-target");
		focusTarget.focus();
		expect(document.activeElement).toBe(focusTarget);

		// Use keyboard shortcut to open so focus target is preserved as activeElement
		await user.keyboard("{Control>}k{/Control}");
		expect(screen.getByTestId("status")).toHaveTextContent("open");

		// Close via keyboard shortcut
		await user.keyboard("{Control>}k{/Control}");
		expect(screen.getByTestId("status")).toHaveTextContent("closed");

		// requestAnimationFrame is used for focus restoration
		await act(async () => {
			await vi.waitFor(() => {
				expect(document.activeElement).toBe(focusTarget);
			});
		});
	});

	it("throws error when used outside provider", () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		expect(() => render(<TestConsumer />)).toThrow(
			"useCommandPalette must be used within CommandPaletteProvider",
		);
		spy.mockRestore();
	});
});

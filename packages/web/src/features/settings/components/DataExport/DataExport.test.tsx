import "fake-indexeddb/auto";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as downloadFileModule from "../../services/downloadFile";
import * as exportServiceModule from "../../services/exportService";
import { DataExport } from "./index";

vi.mock("sonner", () => ({
	toast: Object.assign(vi.fn(), {
		success: vi.fn(),
		error: vi.fn(),
	}),
}));

vi.mock("../../services/exportService", () => ({
	exportAllData: vi.fn(),
}));

vi.mock("../../services/downloadFile", () => ({
	downloadFile: vi.fn(),
	generateExportFilename: vi.fn(() => "mamen-backup-2026-02-09.json"),
}));

describe("DataExport", () => {
	const user = userEvent.setup();

	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(exportServiceModule.exportAllData).mockResolvedValue(
			new Blob(["{}"], { type: "application/json" }),
		);
	});

	it('renders "Export All Data" button in Settings', () => {
		render(<DataExport />);

		expect(
			screen.getByRole("button", { name: /Export All Data/i }),
		).toBeInTheDocument();
		expect(screen.getByText("Data Management")).toBeInTheDocument();
	});

	it("button shows loading state during export", async () => {
		let resolveExport: (value: Blob) => void;
		vi.mocked(exportServiceModule.exportAllData).mockReturnValue(
			new Promise((resolve) => {
				resolveExport = resolve;
			}),
		);

		render(<DataExport />);
		await user.click(screen.getByRole("button", { name: /Export All Data/i }));

		expect(screen.getByText("Exporting...")).toBeInTheDocument();

		resolveExport!(new Blob(["{}"], { type: "application/json" }));
		await waitFor(() => {
			expect(screen.getByText("Export All Data")).toBeInTheDocument();
		});
	});

	it("button is disabled during export", async () => {
		let resolveExport: (value: Blob) => void;
		vi.mocked(exportServiceModule.exportAllData).mockReturnValue(
			new Promise((resolve) => {
				resolveExport = resolve;
			}),
		);

		render(<DataExport />);
		const button = screen.getByRole("button", { name: /Export All Data/i });
		await user.click(button);

		expect(screen.getByRole("button", { name: /Exporting/i })).toBeDisabled();

		resolveExport!(new Blob(["{}"], { type: "application/json" }));
		await waitFor(() => {
			expect(
				screen.getByRole("button", { name: /Export All Data/i }),
			).toBeEnabled();
		});
	});

	it("success toast appears after export", async () => {
		render(<DataExport />);
		await user.click(screen.getByRole("button", { name: /Export All Data/i }));

		await waitFor(() => {
			expect(toast.success).toHaveBeenCalledWith("Data exported successfully");
		});
	});

	it("error toast appears on failure", async () => {
		vi.mocked(exportServiceModule.exportAllData).mockRejectedValue(
			new Error("fail"),
		);

		render(<DataExport />);
		await user.click(screen.getByRole("button", { name: /Export All Data/i }));

		await waitFor(() => {
			expect(toast.error).toHaveBeenCalledWith(
				"Export failed. Please try again.",
			);
		});
	});

	it("selective checkboxes toggle export options", async () => {
		render(<DataExport />);

		const accountsCheckbox = screen.getByLabelText("Accounts");
		expect(accountsCheckbox).toBeChecked();

		await user.click(accountsCheckbox);
		expect(accountsCheckbox).not.toBeChecked();

		await user.click(screen.getByRole("button", { name: /Export All Data/i }));

		await waitFor(() => {
			expect(exportServiceModule.exportAllData).toHaveBeenCalledWith(
				expect.objectContaining({ includeAccounts: false }),
			);
		});
	});

	it("calls downloadFile with correct filename", async () => {
		render(<DataExport />);
		await user.click(screen.getByRole("button", { name: /Export All Data/i }));

		await waitFor(() => {
			expect(downloadFileModule.downloadFile).toHaveBeenCalledWith(
				expect.any(Blob),
				"mamen-backup-2026-02-09.json",
			);
		});
	});

	it("is keyboard accessible - Tab and Enter to export", async () => {
		render(<DataExport />);

		const button = screen.getByRole("button", { name: /Export All Data/i });
		button.focus();
		await user.keyboard("{Enter}");

		await waitFor(() => {
			expect(exportServiceModule.exportAllData).toHaveBeenCalled();
		});
	});
});

import { AlertTriangle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { ImportMode, ImportPreview } from "../../types/import.types";

type ImportPreviewDialogProps = {
	open: boolean;
	preview: ImportPreview;
	onImport: (mode: ImportMode) => void;
	onCancel: () => void;
};

export function ImportPreviewDialog({
	open,
	preview,
	onImport,
	onCancel,
}: ImportPreviewDialogProps): React.ReactElement {
	const [mode, setMode] = useState<ImportMode>("merge");

	const handleImport = (): void => {
		onImport(mode);
	};

	return (
		<Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Import Backup</DialogTitle>
					<DialogDescription>
						Review the backup contents before importing.
					</DialogDescription>
				</DialogHeader>

				{preview.isNewerVersion && (
					<div className="flex items-start gap-2 rounded-md border border-yellow-500/50 bg-yellow-500/10 p-3">
						<AlertTriangle className="h-4 w-4 mt-0.5 text-yellow-500 shrink-0" />
						<p className="text-sm text-yellow-700 dark:text-yellow-400">
							Backup from newer version (v{preview.metadata?.appVersion}), some
							data may not import correctly.
						</p>
					</div>
				)}

				{preview.metadata && (
					<div className="rounded-md border p-3 space-y-1">
						<p className="text-sm">
							<span className="font-medium">Export date:</span>{" "}
							{new Date(preview.metadata.exportDate).toLocaleDateString()}
						</p>
						<p className="text-sm">
							<span className="font-medium">App version:</span>{" "}
							{preview.metadata.appVersion}
						</p>
					</div>
				)}

				<div className="rounded-md border p-3">
					<p className="text-sm font-medium mb-1">Backup contains</p>
					<p className="text-sm text-muted-foreground">
						{preview.recordCounts.accounts} accounts,{" "}
						{preview.recordCounts.transactions} transactions,{" "}
						{preview.recordCounts.merchants} merchants,{" "}
						{preview.recordCounts.rules} rules,{" "}
						{preview.recordCounts.categories} categories
					</p>
				</div>

				<div className="space-y-3">
					<Label>Import mode</Label>
					<RadioGroup
						value={mode}
						onValueChange={(v) => setMode(v as ImportMode)}
					>
						<div className="flex items-start gap-3">
							<RadioGroupItem
								value="merge"
								id="mode-merge"
								className="mt-0.5"
							/>
							<div>
								<Label
									htmlFor="mode-merge"
									className="cursor-pointer font-medium"
								>
									Merge with existing
								</Label>
								<p className="text-sm text-muted-foreground">
									New records will be added, duplicates skipped
								</p>
							</div>
						</div>
						<div className="flex items-start gap-3">
							<RadioGroupItem
								value="replace"
								id="mode-replace"
								className="mt-0.5"
							/>
							<div>
								<Label
									htmlFor="mode-replace"
									className="cursor-pointer font-medium"
								>
									Replace all data
								</Label>
								{mode === "replace" && (
									<p className="text-sm text-destructive">
										This will delete all your current data first
									</p>
								)}
								{mode !== "replace" && (
									<p className="text-sm text-muted-foreground">
										Clears current data, then imports backup
									</p>
								)}
							</div>
						</div>
					</RadioGroup>
				</div>

				<DialogFooter>
					<Button variant="outline" onClick={onCancel}>
						Cancel
					</Button>
					<Button onClick={handleImport}>Import</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

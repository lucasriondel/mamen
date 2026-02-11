import { Download, Loader2 } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
	downloadFile,
	generateExportFilename,
} from "../../services/downloadFile";
import { exportAllData } from "../../services/exportService";
import type { ExportOptions } from "../../types/export.types";

const DEFAULT_OPTIONS: ExportOptions = {
	includeAccounts: true,
	includeTransactions: true,
	includeMerchants: true,
	includeRules: true,
	includeCategories: true,
	includeSubscriptions: true,
	includeSettings: true,
};

type OptionKey = keyof ExportOptions;

const OPTION_LABELS: { key: OptionKey; label: string }[] = [
	{ key: "includeAccounts", label: "Accounts" },
	{ key: "includeTransactions", label: "Transactions" },
	{ key: "includeMerchants", label: "Merchants" },
	{ key: "includeRules", label: "Rules" },
	{ key: "includeCategories", label: "Categories" },
	{ key: "includeSubscriptions", label: "Subscriptions" },
	{ key: "includeSettings", label: "Settings" },
];

export function DataExport(): React.ReactElement {
	const [isExporting, setIsExporting] = useState(false);
	const [options, setOptions] = useState<ExportOptions>(DEFAULT_OPTIONS);

	const handleToggle = useCallback((key: OptionKey) => {
		setOptions((prev) => ({ ...prev, [key]: !prev[key] }));
	}, []);

	const handleExport = useCallback(async () => {
		setIsExporting(true);
		try {
			const blob = await exportAllData(options);
			const filename = generateExportFilename();
			downloadFile(blob, filename);
			toast.success("Data exported successfully");
		} catch {
			toast.error("Export failed. Please try again.");
		} finally {
			setIsExporting(false);
		}
	}, [options]);

	return (
		<Card>
			<CardHeader>
				<CardTitle>Data Management</CardTitle>
				<CardDescription>
					Export your data as a JSON backup file.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="space-y-3">
					<Label>Include in export</Label>
					<div className="grid grid-cols-2 gap-2">
						{OPTION_LABELS.map(({ key, label }) => (
							<div key={key} className="flex items-center gap-2">
								<Checkbox
									id={key}
									checked={options[key]}
									onCheckedChange={() => handleToggle(key)}
									disabled={isExporting}
								/>
								<Label
									htmlFor={key}
									className="text-sm font-normal cursor-pointer"
								>
									{label}
								</Label>
							</div>
						))}
					</div>
				</div>

				<Button
					onClick={handleExport}
					disabled={isExporting}
					className="w-full"
				>
					{isExporting ? (
						<>
							<Loader2 className="h-4 w-4 animate-spin" />
							Exporting...
						</>
					) : (
						<>
							<Download className="h-4 w-4" />
							Export All Data
						</>
					)}
				</Button>
			</CardContent>
		</Card>
	);
}

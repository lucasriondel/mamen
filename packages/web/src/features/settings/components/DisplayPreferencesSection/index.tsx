import { toast } from "sonner";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useDisplayPreferences } from "../../hooks/useDisplayPreferences";
import { updateDisplayPreferences } from "../../services/preferencesService";
import type {
	CurrencySymbol,
	DashboardTimePeriod,
	DateFormatOption,
} from "../../types/preferences.types";

const CURRENCY_OPTIONS: { value: CurrencySymbol; label: string }[] = [
	{ value: "€", label: "€ Euro" },
	{ value: "$", label: "$ Dollar" },
	{ value: "£", label: "£ Pound" },
	{ value: "¥", label: "¥ Yen" },
	{ value: "₹", label: "₹ Rupee" },
	{ value: "kr", label: "kr Krone" },
	{ value: "CHF", label: "CHF Franc" },
];

const DATE_FORMAT_OPTIONS: { value: DateFormatOption; label: string }[] = [
	{ value: "DD/MM/YYYY", label: "DD/MM/YYYY" },
	{ value: "MM/DD/YYYY", label: "MM/DD/YYYY" },
	{ value: "YYYY-MM-DD", label: "YYYY-MM-DD" },
];

const DASHBOARD_PERIOD_OPTIONS: {
	value: DashboardTimePeriod;
	label: string;
}[] = [
	{ value: "this-month", label: "This month" },
	{ value: "last-month", label: "Last month" },
	{ value: "last-3-months", label: "Last 3 months" },
	{ value: "this-year", label: "This year" },
];

export function DisplayPreferencesSection(): React.ReactElement {
	const { preferences } = useDisplayPreferences();

	const handleCurrencyChange = async (value: string): Promise<void> => {
		await updateDisplayPreferences({ currencySymbol: value as CurrencySymbol });
		toast.success("Preferences updated");
	};

	const handleDateFormatChange = async (value: string): Promise<void> => {
		await updateDisplayPreferences({ dateFormat: value as DateFormatOption });
		toast.success("Preferences updated");
	};

	const handleDashboardPeriodChange = async (value: string): Promise<void> => {
		await updateDisplayPreferences({
			defaultDashboardPeriod: value as DashboardTimePeriod,
		});
		toast.success("Preferences updated");
	};

	const handleMultiplierChange = async (
		e: React.ChangeEvent<HTMLInputElement>,
	): Promise<void> => {
		const val = parseFloat(e.target.value);
		if (Number.isNaN(val) || val <= 0) return;
		await updateDisplayPreferences({
			anomalyThreshold: { ...preferences.anomalyThreshold, multiplier: val },
		});
		toast.success("Preferences updated");
	};

	const handleAbsoluteAmountChange = async (
		e: React.ChangeEvent<HTMLInputElement>,
	): Promise<void> => {
		const raw = e.target.value.trim();
		if (raw === "") {
			await updateDisplayPreferences({
				anomalyThreshold: {
					multiplier: preferences.anomalyThreshold.multiplier,
					absoluteAmount: undefined,
				},
			});
			toast.success("Preferences updated");
			return;
		}
		const val = parseFloat(raw);
		if (Number.isNaN(val) || val <= 0) return;
		await updateDisplayPreferences({
			anomalyThreshold: {
				...preferences.anomalyThreshold,
				absoluteAmount: val,
			},
		});
		toast.success("Preferences updated");
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>Display Preferences</CardTitle>
				<CardDescription>
					Customize how data is displayed throughout the app
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="space-y-2">
					<Label htmlFor="currency-symbol">Currency symbol</Label>
					<Select
						value={preferences.currencySymbol}
						onValueChange={handleCurrencyChange}
					>
						<SelectTrigger id="currency-symbol">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{CURRENCY_OPTIONS.map((opt) => (
								<SelectItem key={opt.value} value={opt.value}>
									{opt.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<div className="space-y-2">
					<Label htmlFor="date-format">Date format</Label>
					<Select
						value={preferences.dateFormat}
						onValueChange={handleDateFormatChange}
					>
						<SelectTrigger id="date-format">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{DATE_FORMAT_OPTIONS.map((opt) => (
								<SelectItem key={opt.value} value={opt.value}>
									{opt.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<div className="space-y-2">
					<Label htmlFor="dashboard-period">Default dashboard period</Label>
					<Select
						value={preferences.defaultDashboardPeriod}
						onValueChange={handleDashboardPeriodChange}
					>
						<SelectTrigger id="dashboard-period">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{DASHBOARD_PERIOD_OPTIONS.map((opt) => (
								<SelectItem key={opt.value} value={opt.value}>
									{opt.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<div className="space-y-2">
					<Label htmlFor="anomaly-multiplier">
						Anomaly threshold multiplier
					</Label>
					<div className="flex items-center gap-2">
						<Input
							id="anomaly-multiplier"
							type="number"
							min="1"
							step="0.5"
							defaultValue={preferences.anomalyThreshold.multiplier}
							onBlur={handleMultiplierChange}
							className="w-24"
						/>
						<span className="text-sm text-muted-foreground">x average</span>
					</div>
				</div>

				<div className="space-y-2">
					<Label htmlFor="anomaly-absolute">
						Absolute amount threshold (optional)
					</Label>
					<Input
						id="anomaly-absolute"
						type="number"
						min="0"
						step="50"
						defaultValue={preferences.anomalyThreshold.absoluteAmount ?? ""}
						onBlur={handleAbsoluteAmountChange}
						placeholder="e.g., 500"
						className="w-32"
					/>
				</div>
			</CardContent>
		</Card>
	);
}

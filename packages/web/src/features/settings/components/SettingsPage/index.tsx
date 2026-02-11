import { Settings } from "lucide-react";
import { AboutSection } from "../AboutSection";
import { DataManagementSection } from "../DataManagementSection";
import { DisplayPreferencesSection } from "../DisplayPreferencesSection";
import { LLMConfigForm } from "../LLMConfigForm";

export function SettingsPage(): React.ReactElement {
	return (
		<div className="p-6">
			<div className="flex items-center gap-3 mb-6">
				<Settings className="h-6 w-6" />
				<h2 className="text-2xl font-bold">Settings</h2>
			</div>

			<div className="space-y-6 max-w-2xl">
				<LLMConfigForm />
				<DisplayPreferencesSection />
				<DataManagementSection />
				<AboutSection />
			</div>
		</div>
	);
}

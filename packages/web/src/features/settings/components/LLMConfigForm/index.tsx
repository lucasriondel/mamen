import {
	CheckCircle2,
	Circle,
	Eye,
	EyeOff,
	Loader2,
	XCircle,
	Zap,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import {
	getProviderDefaults,
	isLLMConfigured,
	MODEL_SUGGESTIONS,
	testConnection,
} from "@/lib/llm/client";
import type { AppSettings, LLMProvider, LLMSettings } from "@/types";
import { useSettings } from "../../hooks/useSettings";

const PROVIDER_LABELS: Record<LLMProvider, string> = {
	ollama: "Ollama (Local)",
	"lm-studio": "LM Studio (Local)",
	openai: "OpenAI",
	anthropic: "Anthropic",
	custom: "Custom",
};

const PROVIDER_OPTIONS: LLMProvider[] = [
	"ollama",
	"lm-studio",
	"openai",
	"anthropic",
	"custom",
];

const requiresApiKey = (provider: LLMProvider): boolean => {
	return provider !== "ollama" && provider !== "lm-studio";
};

export function LLMConfigForm(): React.ReactElement {
	const { settings, isLoading, saveSettings } = useSettings();
	const [showApiKey, setShowApiKey] = useState(false);
	const [isTesting, setIsTesting] = useState(false);
	const [saved, setSaved] = useState(false);

	const llm = settings.llm;

	// Local state for text inputs to avoid blocking on every keystroke
	const [localEndpoint, setLocalEndpoint] = useState(llm.endpoint);
	const [localApiKey, setLocalApiKey] = useState(llm.apiKey ?? "");
	const [localModelName, setLocalModelName] = useState(llm.modelName);

	// Sync local state when settings change externally (e.g. provider change)
	useEffect(() => {
		setLocalEndpoint(llm.endpoint);
		setLocalApiKey(llm.apiKey ?? "");
		setLocalModelName(llm.modelName);
	}, [llm.endpoint, llm.apiKey, llm.modelName]);

	const handleChange = useCallback(
		(updates: Partial<LLMSettings>): void => {
			const newSettings: AppSettings = {
				...settings,
				llm: { ...settings.llm, ...updates },
			};
			saveSettings(newSettings);
			setSaved(true);
		},
		[settings, saveSettings],
	);

	// Debounced save for text inputs
	const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
	const debouncedChange = useCallback(
		(updates: Partial<LLMSettings>): void => {
			if (debounceRef.current) clearTimeout(debounceRef.current);
			debounceRef.current = setTimeout(() => {
				handleChange(updates);
			}, 500);
		},
		[handleChange],
	);

	useEffect(() => {
		return () => {
			if (debounceRef.current) clearTimeout(debounceRef.current);
		};
	}, []);

	useEffect(() => {
		if (saved) {
			const timer = setTimeout(() => setSaved(false), 2000);
			return () => clearTimeout(timer);
		}
	}, [saved]);

	const handleProviderChange = useCallback(
		(provider: LLMProvider): void => {
			const defaults = getProviderDefaults(provider);
			handleChange({
				provider,
				endpoint: defaults.endpoint ?? "",
				modelName: defaults.modelName ?? "",
				apiKey: undefined,
				lastTestedAt: undefined,
				lastTestSuccess: undefined,
			});
		},
		[handleChange],
	);

	const handleTestConnection = useCallback(async (): Promise<void> => {
		if (requiresApiKey(llm.provider) && !llm.apiKey) {
			toast.error("API key is required for cloud providers.");
			return;
		}

		setIsTesting(true);
		try {
			const result = await testConnection(llm);
			if (result.success) {
				toast.success(result.message);
				handleChange({
					lastTestedAt: new Date(),
					lastTestSuccess: true,
				});
			} else {
				toast.error(result.message);
				handleChange({
					lastTestedAt: new Date(),
					lastTestSuccess: false,
				});
			}
		} finally {
			setIsTesting(false);
		}
	}, [llm, handleChange]);

	const handleToggleApiKey = useCallback((): void => {
		setShowApiKey((prev) => !prev);
	}, []);

	if (isLoading) {
		return (
			<Card>
				<CardContent className="flex items-center justify-center py-8">
					<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
				</CardContent>
			</Card>
		);
	}

	const connectionStatus = llm.lastTestedAt
		? llm.lastTestSuccess
			? "connected"
			: "error"
		: isLLMConfigured(llm)
			? "configured"
			: "not-configured";

	const modelSuggestions = MODEL_SUGGESTIONS[llm.provider] ?? [];

	return (
		<Card>
			<CardHeader>
				<div className="flex items-center justify-between">
					<div>
						<CardTitle>LLM Configuration</CardTitle>
						<CardDescription>
							Configure your LLM provider for PDF statement parsing. Use a local
							model for privacy or your own cloud API key.
						</CardDescription>
					</div>
					<div className="flex items-center gap-2">
						{saved && (
							<span className="text-xs text-muted-foreground animate-in fade-in">
								Saved
							</span>
						)}
						<ConnectionStatusBadge status={connectionStatus} />
					</div>
				</div>
			</CardHeader>
			<CardContent className="space-y-6">
				<div className="space-y-2">
					<Label htmlFor="provider">Provider</Label>
					<Select
						value={llm.provider}
						onValueChange={(v) => handleProviderChange(v as LLMProvider)}
					>
						<SelectTrigger id="provider" className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{PROVIDER_OPTIONS.map((provider) => (
								<SelectItem key={provider} value={provider}>
									{PROVIDER_LABELS[provider]}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<div className="space-y-2">
					<Label htmlFor="endpoint">Endpoint URL</Label>
					<Input
						id="endpoint"
						type="url"
						value={localEndpoint}
						onChange={(e) => {
							setLocalEndpoint(e.target.value);
							debouncedChange({ endpoint: e.target.value });
						}}
						placeholder={
							getProviderDefaults(llm.provider).endpoint ?? "Enter endpoint URL"
						}
					/>
				</div>

				{requiresApiKey(llm.provider) ? (
					<div className="space-y-2">
						<Label htmlFor="apiKey">API Key</Label>
						<div className="flex gap-2">
							<div className="relative flex-1">
								<Input
									id="apiKey"
									type={showApiKey ? "text" : "password"}
									value={localApiKey}
									onChange={(e) => {
										setLocalApiKey(e.target.value);
										debouncedChange({ apiKey: e.target.value || undefined });
									}}
									placeholder="Enter your API key"
								/>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
									onClick={handleToggleApiKey}
								>
									{showApiKey ? (
										<EyeOff className="h-4 w-4" />
									) : (
										<Eye className="h-4 w-4" />
									)}
								</Button>
							</div>
						</div>
						{llm.provider !== "custom" && (
							<p className="text-xs text-muted-foreground">
								Your API key will be sent to{" "}
								{llm.endpoint || "the configured endpoint"}
							</p>
						)}
					</div>
				) : (
					<div className="space-y-2">
						<Label className="text-muted-foreground">API Key</Label>
						<p className="text-sm text-muted-foreground">
							Not required for local LLM
						</p>
					</div>
				)}

				<div className="space-y-2">
					<Label htmlFor="modelName">Model Name</Label>
					<Input
						id="modelName"
						value={localModelName}
						onChange={(e) => {
							setLocalModelName(e.target.value);
							debouncedChange({ modelName: e.target.value });
						}}
						placeholder="Enter model name"
					/>
					{modelSuggestions.length > 0 && (
						<div className="flex flex-wrap gap-1 mt-1">
							{modelSuggestions.map((model) => (
								<button
									key={model}
									type="button"
									className="text-xs px-2 py-0.5 rounded-full bg-accent text-accent-foreground hover:bg-accent/80 transition-colors"
									onClick={() => handleChange({ modelName: model })}
								>
									{model}
								</button>
							))}
						</div>
					)}
				</div>

				<div className="flex items-center gap-3 pt-2">
					<Button
						onClick={handleTestConnection}
						disabled={isTesting || !llm.endpoint}
						variant="outline"
					>
						{isTesting ? (
							<Loader2 className="h-4 w-4 animate-spin" />
						) : (
							<Zap className="h-4 w-4" />
						)}
						{isTesting ? "Testing..." : "Test Connection"}
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}

type ConnectionStatusBadgeProps = {
	status: "not-configured" | "configured" | "connected" | "error";
};

function ConnectionStatusBadge({
	status,
}: ConnectionStatusBadgeProps): React.ReactElement {
	switch (status) {
		case "connected":
			return (
				<Badge
					variant="outline"
					className="gap-1 text-green-500 border-green-500/30"
				>
					<CheckCircle2 className="h-3 w-3" />
					Connected
				</Badge>
			);
		case "error":
			return (
				<Badge
					variant="outline"
					className="gap-1 text-red-500 border-red-500/30"
				>
					<XCircle className="h-3 w-3" />
					Error
				</Badge>
			);
		case "configured":
			return (
				<Badge
					variant="outline"
					className="gap-1 text-yellow-500 border-yellow-500/30"
				>
					<Circle className="h-3 w-3" />
					Untested
				</Badge>
			);
		case "not-configured":
			return (
				<Badge variant="outline" className="gap-1 text-muted-foreground">
					<Circle className="h-3 w-3" />
					Not configured
				</Badge>
			);
	}
}

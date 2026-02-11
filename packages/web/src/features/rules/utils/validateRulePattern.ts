export const validateRulePattern = (
	pattern: string,
): { isValid: boolean; error: string | null } => {
	if (!pattern.trim()) {
		return { isValid: false, error: "Pattern cannot be empty" };
	}
	try {
		new RegExp(pattern, "i");
		return { isValid: true, error: null };
	} catch (e) {
		const errorMessage =
			e instanceof Error ? e.message : "Invalid regex pattern";
		return { isValid: false, error: errorMessage };
	}
};

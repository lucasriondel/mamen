import { useCallback, useState } from "react";
import {
	applyMatchResults,
	applyRulesToTransactions,
} from "../services/rulesEngine";

export type RulesEngineResult = {
	matchedCount: number;
	unmatchedCount: number;
	skippedRulesCount: number;
	processingTimeMs: number;
};

export const useRulesEngine = () => {
	const [isProcessing, setIsProcessing] = useState(false);
	const [error, setError] = useState<Error | null>(null);

	const applyRulesToNewTransactions = useCallback(
		async (transactionIds: number[]): Promise<RulesEngineResult> => {
			setIsProcessing(true);
			setError(null);

			try {
				const results = await applyRulesToTransactions(transactionIds);
				await applyMatchResults(results.matched);

				return {
					matchedCount: results.matched.length,
					unmatchedCount: results.unmatched.length,
					skippedRulesCount: results.skippedRules.length,
					processingTimeMs: results.processingTimeMs,
				};
			} catch (err) {
				const error =
					err instanceof Error ? err : new Error("Rules engine failed");
				setError(error);
				throw error;
			} finally {
				setIsProcessing(false);
			}
		},
		[],
	);

	return {
		applyRulesToNewTransactions,
		isProcessing,
		error,
	};
};

import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { transactionsApi } from "@/lib/api";

export const useNavigateToTransaction = () => {
	const navigate = useNavigate();

	const navigateToTransaction = async (
		transactionId: number,
	): Promise<void> => {
		const tx = await transactionsApi.get(transactionId);
		if (!tx) {
			toast.error("Linked transaction not found");
			return;
		}
		navigate({
			to: "/transactions",
			search: { highlight: transactionId },
		});
	};

	return { navigateToTransaction };
};

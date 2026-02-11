import { useCallback, useState } from "react";
import { toast } from "sonner";
import { invalidateEntity } from "@/lib/api";
import type { Transaction } from "@/types";
import {
	linkRefund,
	markAsOrphanRefund,
	replaceLinkRefund,
	undoLinkRefund,
	undoOrphanRefund,
	undoReplaceLinkRefund,
	undoUnlinkRefund,
	unlinkRefund,
} from "../services/refundService";

type RefundModalView = "linked" | "search";

type UseRefundLinkReturn = {
	isOpen: boolean;
	sourceTransaction: Transaction | null;
	modalView: RefundModalView;
	openRefundLink: (transaction: Transaction) => void;
	closeRefundLink: () => void;
	handleConfirmLink: (targetTransactionId: number) => Promise<void>;
	handleConfirmOrphan: () => Promise<void>;
	handleUnlink: () => Promise<void>;
	handleChangeLink: () => void;
	handleReplaceLink: (
		newPurchaseTransactionId: number,
		oldPurchaseTransactionId: number,
	) => Promise<void>;
	isLinking: boolean;
};

export const useRefundLink = (): UseRefundLinkReturn => {
	const [isOpen, setIsOpen] = useState(false);
	const [sourceTransaction, setSourceTransaction] =
		useState<Transaction | null>(null);
	const [isLinking, setIsLinking] = useState(false);
	const [modalView, setModalView] = useState<RefundModalView>("search");

	const openRefundLink = useCallback((transaction: Transaction) => {
		setSourceTransaction(transaction);
		setModalView(transaction.linkedRefundId ? "linked" : "search");
		setIsOpen(true);
	}, []);

	const closeRefundLink = useCallback(() => {
		setIsOpen(false);
		setSourceTransaction(null);
		setModalView("search");
	}, []);

	const handleConfirmLink = useCallback(
		async (targetTransactionId: number) => {
			if (!sourceTransaction?.id) return;

			setIsLinking(true);
			try {
				const refundId = sourceTransaction.id;
				await linkRefund(refundId, targetTransactionId);
				invalidateEntity("transactions");

				closeRefundLink();

				toast("Refund linked to original purchase", {
					action: {
						label: "Undo",
						onClick: () => {
							undoLinkRefund(refundId, targetTransactionId).then(() => {
								invalidateEntity("transactions");
							});
							toast("Refund link undone");
						},
					},
					duration: 10000,
				});
			} catch (err) {
				const message =
					err instanceof Error ? err.message : "Failed to link refund";
				toast.error(message);
			} finally {
				setIsLinking(false);
			}
		},
		[sourceTransaction, closeRefundLink],
	);

	const handleConfirmOrphan = useCallback(async () => {
		if (!sourceTransaction?.id) return;

		setIsLinking(true);
		try {
			const txId = sourceTransaction.id;
			await markAsOrphanRefund(txId);
			invalidateEntity("transactions");

			closeRefundLink();

			toast("Marked as refund", {
				action: {
					label: "Undo",
					onClick: () => {
						undoOrphanRefund(txId).then(() => {
							invalidateEntity("transactions");
						});
						toast("Refund marking undone");
					},
				},
				duration: 10000,
			});
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Failed to mark as refund";
			toast.error(message);
		} finally {
			setIsLinking(false);
		}
	}, [sourceTransaction, closeRefundLink]);

	const handleUnlink = useCallback(async () => {
		if (!sourceTransaction?.id || !sourceTransaction.linkedRefundId) return;

		setIsLinking(true);
		try {
			const refundId = sourceTransaction.id;
			const purchaseId = sourceTransaction.linkedRefundId;
			await unlinkRefund(refundId, purchaseId);
			invalidateEntity("transactions");

			closeRefundLink();

			toast("Refund unlinked", {
				action: {
					label: "Undo",
					onClick: () => {
						undoUnlinkRefund(refundId, purchaseId).then(() => {
							invalidateEntity("transactions");
						});
						toast("Unlink undone");
					},
				},
				duration: 10000,
			});
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Failed to unlink refund";
			toast.error(message);
		} finally {
			setIsLinking(false);
		}
	}, [sourceTransaction, closeRefundLink]);

	const handleChangeLink = useCallback(() => {
		setModalView("search");
	}, []);

	const handleReplaceLink = useCallback(
		async (
			newPurchaseTransactionId: number,
			oldPurchaseTransactionId: number,
		) => {
			if (!sourceTransaction?.id) return;

			setIsLinking(true);
			try {
				const refundId = sourceTransaction.id;
				await replaceLinkRefund(
					refundId,
					oldPurchaseTransactionId,
					newPurchaseTransactionId,
				);
				invalidateEntity("transactions");

				closeRefundLink();

				toast("Refund link updated", {
					action: {
						label: "Undo",
						onClick: () => {
							undoReplaceLinkRefund(
								refundId,
								oldPurchaseTransactionId,
								newPurchaseTransactionId,
							).then(() => {
								invalidateEntity("transactions");
							});
							toast("Replace link undone");
						},
					},
					duration: 10000,
				});
			} catch (err) {
				const message =
					err instanceof Error ? err.message : "Failed to replace refund link";
				toast.error(message);
			} finally {
				setIsLinking(false);
			}
		},
		[sourceTransaction, closeRefundLink],
	);

	return {
		isOpen,
		sourceTransaction,
		modalView,
		openRefundLink,
		closeRefundLink,
		handleConfirmLink,
		handleConfirmOrphan,
		handleUnlink,
		handleChangeLink,
		handleReplaceLink,
		isLinking,
	};
};

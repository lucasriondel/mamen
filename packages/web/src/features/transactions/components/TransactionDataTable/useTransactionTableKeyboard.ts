import type { Table } from "@tanstack/react-table";
import type { Virtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useRef } from "react";
import type { Transaction } from "@/types";

export type ActionKey = "r" | "c" | "f" | "d";

type ActionTarget =
	| { mode: "batch"; ids: number[] }
	| { mode: "single"; transaction: Transaction };

export type UseTransactionTableKeyboardOptions = {
	table: Table<Transaction>;
	rows: Transaction[];
	cursorRowId: string | null;
	setCursorRowId: (id: string | null) => void;
	hoveredRowId: string | null;
	virtualizer: Virtualizer<HTMLDivElement, Element>;
	onAction: (key: ActionKey, target: ActionTarget) => void;
	enabled?: boolean;
};

export const useTransactionTableKeyboard = ({
	table,
	rows,
	cursorRowId,
	setCursorRowId,
	hoveredRowId,
	virtualizer,
	onAction,
	enabled = true,
}: UseTransactionTableKeyboardOptions): void => {
	const cursorRef = useRef(cursorRowId);
	cursorRef.current = cursorRowId;

	const hoveredRef = useRef(hoveredRowId);
	hoveredRef.current = hoveredRowId;

	const rowsRef = useRef(rows);
	rowsRef.current = rows;

	const tableRef = useRef(table);
	tableRef.current = table;

	const onActionRef = useRef(onAction);
	onActionRef.current = onAction;

	const virtualizerRef = useRef(virtualizer);
	virtualizerRef.current = virtualizer;

	const getCursorIndex = useCallback((): number => {
		if (cursorRef.current === null) return -1;
		return rowsRef.current.findIndex((r) => String(r.id) === cursorRef.current);
	}, []);

	const scrollToIndex = useCallback((index: number) => {
		virtualizerRef.current.scrollToIndex(index, {
			align: "auto",
			behavior: "smooth",
		});
	}, []);

	const moveCursor = useCallback(
		(direction: 1 | -1, shiftKey: boolean) => {
			const currentRows = rowsRef.current;
			if (currentRows.length === 0) return;

			const tbl = tableRef.current;
			const prevIndex = getCursorIndex();
			let newIndex: number;
			if (prevIndex === -1) {
				newIndex = 0;
			} else {
				const raw = prevIndex + direction;
				if (raw < 0) newIndex = currentRows.length - 1;
				else if (raw >= currentRows.length) newIndex = 0;
				else newIndex = raw;
			}

			const newRow = currentRows[newIndex];
			if (!newRow?.id) return;

			const newId = String(newRow.id);

			if (shiftKey) {
				// On first shift-navigate, also select the anchor row
				if (
					Object.keys(tbl.getState().rowSelection).length === 0 &&
					prevIndex >= 0
				) {
					const anchorRow = currentRows[prevIndex];
					if (anchorRow?.id) {
						tbl.getRow(String(anchorRow.id))?.toggleSelected(true);
					}
				}
				tbl.getRow(newId)?.toggleSelected(true);
			}

			setCursorRowId(newId);
			scrollToIndex(newIndex);
		},
		[getCursorIndex, setCursorRowId, scrollToIndex],
	);

	const resolveTarget = useCallback((): ActionTarget | null => {
		const tbl = tableRef.current;
		const selection = tbl.getState().rowSelection;
		const selectedIds = Object.keys(selection).filter((k) => selection[k]);

		if (selectedIds.length > 0) {
			return { mode: "batch", ids: selectedIds.map(Number) };
		}

		if (cursorRef.current !== null) {
			const tx = rowsRef.current.find(
				(r) => String(r.id) === cursorRef.current,
			);
			if (tx) return { mode: "single", transaction: tx };
		}

		if (hoveredRef.current !== null) {
			const tx = rowsRef.current.find(
				(r) => String(r.id) === hoveredRef.current,
			);
			if (tx) return { mode: "single", transaction: tx };
		}

		return null;
	}, []);

	const handleKeyDown = useCallback(
		(event: KeyboardEvent) => {
			if (!enabled) return;

			const target = event.target as HTMLElement;
			if (
				target.tagName === "INPUT" ||
				target.tagName === "TEXTAREA" ||
				target.isContentEditable
			) {
				return;
			}

			const key = event.key.toLowerCase();

			switch (key) {
				case "j":
				case "arrowdown": {
					event.preventDefault();
					moveCursor(1, event.shiftKey);
					break;
				}

				case "k":
				case "arrowup": {
					event.preventDefault();
					moveCursor(-1, event.shiftKey);
					break;
				}

				case " ":
				case "x": {
					if (cursorRef.current !== null) {
						event.preventDefault();
						const row = tableRef.current.getRow(cursorRef.current);
						row?.toggleSelected();
					}
					break;
				}

				case "escape": {
					event.preventDefault();
					const tbl = tableRef.current;
					const hasSelection =
						Object.keys(tbl.getState().rowSelection).length > 0;
					if (hasSelection) {
						tbl.resetRowSelection();
					} else {
						setCursorRowId(null);
					}
					break;
				}

				case "r":
				case "c":
				case "f":
				case "d": {
					const actionTarget = resolveTarget();
					if (actionTarget) {
						event.preventDefault();
						onActionRef.current(key as ActionKey, actionTarget);
					}
					break;
				}

				default:
					break;
			}
		},
		[enabled, moveCursor, setCursorRowId, resolveTarget],
	);

	useEffect(() => {
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [handleKeyDown]);
};

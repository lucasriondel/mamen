import type { Account } from "@mamen/shared/contract";
import { cn } from "@/lib/utils";
import { resolveAccountColor } from "./account-color";

export interface AccountBadgeProps {
	/** The account to name. `undefined` renders the unknown-account placeholder. */
	account: Pick<Account, "id" | "name" | "color"> | undefined;
	className?: string;
}

/**
 * An account's name as a colour-tinted pill — the transactions table's account
 * cell (issue: badge as account name).
 *
 * A *pill*, where a category renders as coloured text: both can appear on the
 * same transaction row, so giving them the same treatment would invite reading a
 * shared colour as a shared meaning. The enclosing shape is what says "this is
 * which account", independent of hue.
 *
 * The tint is derived from one colour rather than stored as a pair: the text
 * takes the account's **Resolved colour** and the background is that same colour
 * mixed into the panel at low alpha (`color-mix`), so contrast holds in both
 * themes without a second stored value to keep in sync — and an account the user
 * has never recoloured still gets a distinct badge, because a null colour
 * resolves to a stable palette entry rather than to nothing.
 */
export function AccountBadge({ account, className }: AccountBadgeProps) {
	if (account === undefined) {
		// A transaction whose account was deleted, or not yet loaded. Rendering a
		// coloured pill here would invent an identity for a row that has none.
		return <span className="text-gousse-muted">—</span>;
	}

	const color = resolveAccountColor(account);

	return (
		<span
			data-account-color={color}
			style={{
				color,
				// 12% of the account's hue over the panel — enough to read as a filled
				// pill, light enough to keep the label at full contrast on top of it.
				backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
				borderColor: `color-mix(in srgb, ${color} 28%, transparent)`,
			}}
			className={cn(
				"inline-flex max-w-full items-center truncate rounded-full border px-2 py-0.5 font-medium text-xs",
				className,
			)}
			title={account.name}
		>
			{account.name}
		</span>
	);
}

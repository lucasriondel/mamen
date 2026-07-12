import { type FormEvent, useState } from "react";
import { ACCOUNT_TYPE_OPTIONS, type AccountType } from "./account-type";
import { useAccountMutations } from "./use-account-mutations";

const INPUT_CLASS =
	"rounded-md border border-line bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-accent";

/**
 * The "add account" form: a name field, a type `<select>`, and a submit button.
 *
 * On submit it calls the accounts `create` mutation with the `{ name, type }`
 * payload (the SDK boundary the tests assert against); the mutation owns
 * invalidation so the list refreshes. The name is trimmed and required —
 * submitting an empty name is a no-op — and the fields reset only after a
 * successful create.
 */
export function CreateAccountForm() {
	const { create } = useAccountMutations();
	const [name, setName] = useState("");
	const [type, setType] = useState<AccountType>("checking");

	const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const trimmed = name.trim();
		if (trimmed.length === 0 || create.isPending) return;
		create.mutate(
			{ name: trimmed, type },
			{
				onSuccess: () => {
					setName("");
					setType("checking");
				},
			},
		);
	};

	return (
		<form
			onSubmit={handleSubmit}
			className="flex flex-wrap items-end gap-3"
			aria-label="Add account"
		>
			<label className="flex flex-col gap-1 text-sm text-muted">
				Name
				<input
					className={INPUT_CLASS}
					value={name}
					onChange={(event) => setName(event.target.value)}
					placeholder="e.g. Everyday checking"
					aria-label="Account name"
				/>
			</label>
			<label className="flex flex-col gap-1 text-sm text-muted">
				Type
				<select
					className={INPUT_CLASS}
					value={type}
					onChange={(event) => setType(event.target.value as AccountType)}
					aria-label="Account type"
				>
					{ACCOUNT_TYPE_OPTIONS.map((option) => (
						<option key={option.value} value={option.value}>
							{option.label}
						</option>
					))}
				</select>
			</label>
			<button
				type="submit"
				disabled={create.isPending || name.trim().length === 0}
				className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-bg disabled:opacity-50"
			>
				Add account
			</button>
		</form>
	);
}

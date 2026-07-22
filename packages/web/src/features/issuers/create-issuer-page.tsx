import type { CategoryId, Issuer } from "@mamen/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { issuerQueries } from "@/lib/sdk";
import { CategoryLeafPicker } from "./category-leaf-picker";
import { INPUT_CLASS } from "./field-styles";
import { hasExactIssuerName } from "./issuer-name";
import { useIssuerMutations } from "./use-issuer-mutations";

/**
 * The standalone **Create issuer** page at `/issuers/new`. Issuers are otherwise
 * born only as a side effect of resolving a transaction's counterparty; this is
 * the first-class way to make one by hand — chiefly to **pre-seed a default
 * category before the first transaction**, so future matching transactions
 * auto-file (the category is read *through* the issuer, so setting it up front
 * back-files nothing yet and forward-files everything).
 *
 * Unlike the detail page (a stack of write-on-action controls), this is one
 * form: a draft name + an optional default category, collected and submitted
 * together. On success it navigates to the new issuer's detail page and toasts.
 *
 * `firstSeen` is required by the contract but has no meaning before the first
 * transaction, so it is hidden from the form and stamped "now" by the `create`
 * mutation (mirroring the assignment picker). The name guard is a UX nicety —
 * trim, block empty, and disable Save on an exact case-insensitive match with an
 * already-loaded issuer ({@link hasExactIssuerName}); the contract enforces no
 * uniqueness.
 */
export function CreateIssuerPage() {
	const navigate = useNavigate();
	const { create } = useIssuerMutations();
	const [name, setName] = useState("");
	const [categoryId, setCategoryId] = useState<CategoryId | null>(null);

	// Loaded so the duplicate-name guard has something to check against; the guard
	// only covers the names the client has in hand (the contract allows dupes).
	const issuersQuery = useQuery(issuerQueries.list({ orderBy: "name" }));
	const issuers = (issuersQuery.data?.items ?? []) as readonly Issuer[];

	const trimmed = name.trim();
	const isDuplicate = hasExactIssuerName(issuers, trimmed);
	const canSubmit = trimmed.length > 0 && !isDuplicate && !create.isPending;

	const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!canSubmit) return;
		create.mutate(
			{
				name: trimmed,
				...(categoryId != null ? { defaultCategoryId: categoryId } : {}),
			},
			{
				onSuccess: (issuer) => {
					toast.success("Issuer created");
					navigate({
						to: "/issuers/$issuerId",
						params: { issuerId: String(issuer.id) },
					});
				},
			},
		);
	};

	return (
		<section className="flex flex-col gap-8">
			<Link
				to="/issuers"
				className="flex items-center gap-1 self-start text-sm text-muted transition-colors hover:text-ink"
			>
				<ArrowLeft size={16} aria-hidden />
				Issuers
			</Link>

			<header>
				<h1 className="text-balance text-2xl font-semibold text-ink">
					Create issuer
				</h1>
				<p className="mt-1 text-muted">
					Give it a default category and future matching transactions will file
					themselves.
				</p>
			</header>

			<form onSubmit={handleSubmit} className="flex max-w-md flex-col gap-6">
				<label className="flex flex-col gap-1 text-sm text-muted">
					Name
					<input
						className={INPUT_CLASS}
						value={name}
						onChange={(event) => setName(event.target.value)}
						placeholder="e.g. Spotify"
						aria-label="Issuer name"
					/>
					{isDuplicate ? (
						<span className="text-xs text-high">
							An issuer with this name already exists.
						</span>
					) : null}
				</label>

				<div className="flex flex-col gap-1">
					<span className="text-sm text-muted">
						Default category (optional)
					</span>
					<CategoryLeafPicker
						value={categoryId}
						onChange={setCategoryId}
						title="Set a default category"
						selectedLabel="Selected category"
						clearLabel="Remove category"
					/>
				</div>

				<Button type="submit" disabled={!canSubmit} className="self-start">
					Create issuer
				</Button>
			</form>
		</section>
	);
}

import type { Issuer, LogoSearchResult } from "@mamen/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { type FormEvent, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { issuerQueries } from "@/lib/sdk";
import { imageFetchRefusedMessage, logoSearchFailure } from "@/lib/sdk-error";
import { cn } from "@/lib/utils";
import { useIssuerMutations } from "./use-issuer-mutations";

/** Where the unconfigured state sends the reader. Repo-relative, because that
 * is where the person who can fix it works — there is no hosted copy to link. */
const SETUP_GUIDE = "docs/operations/logo-search-setup.md";

/** The variables the API wants, named when the server doesn't say which. */
const CONFIG_VARS = ["LOGODEV_TOKEN"] as const;

/**
 * The query a freshly-opened popover carries: the issuer's name, verbatim.
 * logo.dev resolves brand *names* (ADR 0007, amended), so no "logo" suffix —
 * "Acme logo" is a brand it has never heard of. Composed on the client, not
 * the server — the server takes `q` verbatim, so what the user sees in the
 * field is exactly what will be asked.
 */
export function defaultLogoQuery(name: string): string {
	return name.trim();
}

export interface LogoSearchPopoverProps {
	issuer: Issuer;
	className?: string;
}

/**
 * **Logo search** (issue #61, ADR 0007): find an issuer's image by search
 * instead of by file, and pick it out of a mosaic of thumbnails.
 *
 * The whole interaction is shaped to spend as few upstream lookups as
 * possible — the provider is rate-limited:
 *
 * - It opens with the query already filled in and **focus on the search
 *   button**, not the field. The pre-filled query is usually right, so the
 *   common case is one keypress and one query; the field stays editable for
 *   when it isn't.
 * - A search fires **only on submit**. Not per keystroke, and not on a
 *   debounce — a debounce bounds the rate of spending, not the total.
 * - Submitting text that was already searched changes nothing: it re-uses the
 *   query key, whose held answer never goes stale (see
 *   `issuerQueries.logoSearch`). Re-opening the popover on the same issuer is
 *   free for the same reason, so the results survive a stray Escape.
 *
 * The three read failures are three different answers, not three wordings of
 * one (see {@link logoSearchFailure}): *unconfigured* names the variables to
 * set and points at the setup guide; *rate limit spent* offers no retry,
 * because retrying now cannot work; only a transport failure gets a Try again
 * button.
 *
 * A **refused download** is different again — it is about one result, not the
 * search — so it is reported under a mosaic that stays on screen. The point of
 * the guards is that some results are unfetchable; the recovery is picking a
 * different one, which requires still being able to see them.
 */
export function LogoSearchPopover({
	issuer,
	className,
}: LogoSearchPopoverProps) {
	const [open, setOpen] = useState(false);
	const [draft, setDraft] = useState(() => defaultLogoQuery(issuer.name));
	/**
	 * The query that has actually been *submitted*, or `null` before the first
	 * submit. This — not {@link draft} — is what the read is keyed on, which is
	 * how typing costs nothing: a keystroke moves the draft and the query key
	 * stays where it was.
	 */
	const [submitted, setSubmitted] = useState<string | null>(null);
	const searchButtonRef = useRef<HTMLButtonElement>(null);

	const { setImageFromUrl } = useIssuerMutations();

	const search = useQuery({
		...issuerQueries.logoSearch(submitted ?? ""),
		enabled: submitted !== null,
	});

	const results = search.data?.results ?? [];

	const handleOpenChange = (next: boolean) => {
		setOpen(next);
		if (!next) return;
		// Re-seed the field from the issuer's current name, so a query abandoned
		// mid-edit doesn't come back on the next open. `submitted` deliberately
		// survives: its answer is still cached, and dropping it would make the
		// results vanish while the call that bought them stays spent.
		setDraft(defaultLogoQuery(issuer.name));
		setImageFromUrl.reset();
	};

	const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const query = draft.trim();
		if (query.length === 0) return;
		setImageFromUrl.reset();
		// Never `refetch()`: submitting the same text must land on the same cached
		// answer rather than buying it twice.
		setSubmitted(query);
	};

	const pick = (result: LogoSearchResult) => {
		if (setImageFromUrl.isPending) return;
		setImageFromUrl.mutate(
			{ id: issuer.id, url: result.imageUrl },
			// Closing only on success is what leaves a refusal's message beside the
			// results it refers to.
			{ onSuccess: () => setOpen(false) },
		);
	};

	return (
		<Popover open={open} onOpenChange={handleOpenChange}>
			<PopoverTrigger asChild>
				<Button variant="secondary" size="sm" className={className}>
					<Search size={14} aria-hidden />
					Search logo
				</Button>
			</PopoverTrigger>
			<PopoverContent
				className="flex w-80 flex-col gap-3 p-3"
				onOpenAutoFocus={(event) => {
					// Radix focuses the panel; focus the *action* instead, so the common
					// case (the pre-filled query is right) is one keypress.
					event.preventDefault();
					searchButtonRef.current?.focus();
				}}
			>
				<form onSubmit={handleSubmit} className="flex items-end gap-2">
					<Input
						value={draft}
						onChange={(event) => setDraft(event.target.value)}
						aria-label="Logo search query"
						className="flex-1"
					/>
					<Button
						ref={searchButtonRef}
						type="submit"
						size="sm"
						disabled={draft.trim().length === 0 || search.isFetching}
					>
						Search
					</Button>
				</form>

				<SearchBody
					pending={search.isFetching}
					untouched={submitted === null}
					error={search.isError ? search.error : null}
					results={results}
					onRetry={() => search.refetch()}
					onPick={pick}
					picking={setImageFromUrl.isPending}
				/>

				{setImageFromUrl.isError ? (
					<p role="alert" className="text-xs text-gousse-high">
						{imageFetchRefusedMessage(setImageFromUrl.error)}
					</p>
				) : null}
			</PopoverContent>
		</Popover>
	);
}

interface SearchBodyProps {
	pending: boolean;
	/** Nothing has been submitted yet — the state the popover opens in. */
	untouched: boolean;
	error: unknown;
	results: readonly LogoSearchResult[];
	onRetry: () => void;
	onPick: (result: LogoSearchResult) => void;
	picking: boolean;
}

/** The panel below the form: hint, spinner text, failure, or the mosaic. */
function SearchBody({
	pending,
	untouched,
	error,
	results,
	onRetry,
	onPick,
	picking,
}: SearchBodyProps) {
	if (pending) {
		return <p className="text-xs text-gousse-muted">Searching…</p>;
	}
	if (error != null) {
		return <SearchFailure error={error} onRetry={onRetry} />;
	}
	if (untouched) {
		return (
			<p className="text-xs text-gousse-muted">
				Search the web for this issuer's logo, then pick one.
			</p>
		);
	}
	if (results.length === 0) {
		return (
			<p className="text-xs text-gousse-muted">
				No logos found. Try a different query.
			</p>
		);
	}
	return <LogoMosaic results={results} onPick={onPick} picking={picking} />;
}

/** One of the three read failures, each with its own affordance. */
function SearchFailure({
	error,
	onRetry,
}: {
	error: unknown;
	onRetry: () => void;
}) {
	const failure = logoSearchFailure(error);

	if (failure.kind === "unconfigured") {
		const missing = failure.missing.length > 0 ? failure.missing : CONFIG_VARS;
		return (
			<div role="alert" className="flex flex-col gap-1 text-xs">
				<p className="font-medium text-gousse-ink">
					Logo search isn't set up yet.
				</p>
				<p className="text-gousse-muted">
					The API is missing {missing.join(" and ")}. Set them and restart it —
					see <code>{SETUP_GUIDE}</code>. Uploading a file still works.
				</p>
			</div>
		);
	}

	if (failure.kind === "quota") {
		// No retry button, on purpose: the limit stays spent until the window
		// resets, and a button here would only invite learning that again.
		return (
			<div role="alert" className="flex flex-col gap-1 text-xs">
				<p className="font-medium text-gousse-ink">Rate limit reached.</p>
				<p className="text-gousse-muted">
					Logo search's provider is refusing further lookups for now. Wait a
					while and search again — or upload a file in the meantime.
				</p>
			</div>
		);
	}

	return (
		<div role="alert" className="flex flex-col items-start gap-2 text-xs">
			<p className="text-gousse-muted">
				Couldn't reach logo search. It may be a passing network problem.
			</p>
			<Button variant="secondary" size="sm" onClick={onRetry}>
				Try again
			</Button>
		</div>
	);
}

/** The results, as a grid of thumbnails. Each is a real button, so Tab walks
 * them in order and Enter picks one. */
function LogoMosaic({
	results,
	onPick,
	picking,
}: {
	results: readonly LogoSearchResult[];
	onPick: (result: LogoSearchResult) => void;
	picking: boolean;
}) {
	return (
		<ul className="grid max-h-64 grid-cols-3 gap-2 overflow-y-auto">
			{results.map((result) => (
				<li key={result.imageUrl}>
					<button
						type="button"
						onClick={() => onPick(result)}
						disabled={picking}
						title={result.title || result.imageUrl}
						className={cn(
							"flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl",
							"border border-gousse-line bg-gousse-bg p-1 transition-colors",
							"hover:border-gousse-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gousse-accent",
							"disabled:opacity-50",
						)}
					>
						<img
							src={result.thumbnailUrl}
							alt={result.title || "Search result"}
							className="max-h-full max-w-full object-contain"
							loading="lazy"
						/>
					</button>
				</li>
			))}
		</ul>
	);
}

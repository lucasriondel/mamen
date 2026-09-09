import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/** How long typing pauses before a search term is written to the URL/query. */
export const SEARCH_DEBOUNCE_MS = 250;

export interface TransactionsSearchInputProps {
  /** The applied search term from the URL, or `undefined` when cleared. */
  value: string | undefined;
  /** Emit a (debounced) term change; `undefined` clears the search. */
  onChange: (search: string | undefined) => void;
}

/**
 * The debounced search box. Local `text` state gives an immediate, responsive
 * field; a trailing-edge timer commits the trimmed term to `onChange` after the
 * user pauses. The applied `value` (from the URL) is mirrored back into `text`
 * whenever it changes externally (Clear button, back/forward), but never
 * mid-typing.
 *
 * Borderless: it sits inside the filter bar's rail, which draws the border for
 * the whole group. The magnifier stays as the field's own mark, since a bare
 * input in a rail of controls would otherwise be unidentifiable.
 */
export function TransactionsSearchInput({ value, onChange }: TransactionsSearchInputProps) {
  const [text, setText] = useState(value ?? "");
  // Keep the latest `onChange` without making it a debounce dependency.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Reflect external changes to the applied term (Clear, history nav) into the
  // field. `value ?? ""` compared to `text` avoids clobbering in-flight typing.
  const applied = value ?? "";
  // Sync only on the applied value; `text` is deliberately not a dependency, so
  // typing is not overwritten by the effect that mirrors the prop in.
  useEffect(() => {
    setText(applied);
  }, [applied]);

  // Debounce committing the trimmed term. A no-op when it already matches the
  // applied value, so mirroring `value` in doesn't echo back out.
  useEffect(() => {
    const trimmed = text.trim();
    if (trimmed === applied) return;
    const id = setTimeout(() => {
      onChangeRef.current(trimmed === "" ? undefined : trimmed);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [text, applied]);

  return (
    <div className="relative flex min-w-40 flex-1 items-center">
      <Search size={14} className="pointer-events-none absolute left-2.5 text-gousse-muted" />
      <input
        type="search"
        aria-label="Search transactions"
        placeholder="Search transactions…"
        className="h-8 w-full border-0 bg-transparent pl-8 text-sm text-gousse-ink outline-none placeholder:text-gousse-muted"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
    </div>
  );
}

import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";

/** How long typing pauses before a filter term is written to the URL. */
const FILTER_DEBOUNCE_MS = 200;

export interface IssuersFilterInputProps {
  /** The applied term from the URL, or `undefined` when the filter is off. */
  value: string | undefined;
  /** Emit a (debounced) term change; `undefined` clears the filter. */
  onChange: (query: string | undefined) => void;
}

/**
 * The issuers table's name filter. Local `text` state keeps the field
 * immediately responsive while a trailing-edge timer commits the trimmed term,
 * so a URL write (which adds a history entry) fires once the user pauses rather
 * than on every keystroke — the same shape as the transactions search box.
 *
 * The filtering itself is client-side (`filterIssuers`); the debounce is only
 * about how often the URL is rewritten, not about network cost.
 */
export function IssuersFilterInput({ value, onChange }: IssuersFilterInputProps) {
  const [text, setText] = useState(value ?? "");
  // Keep the latest `onChange` without making it a debounce dependency.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Reflect external changes to the applied term (history nav) into the field.
  // Deliberately keyed on `applied` alone — including `text` would overwrite
  // what the user is mid-way through typing.
  const applied = value ?? "";
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
    }, FILTER_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [text, applied]);

  return (
    <div className="relative flex items-center">
      <Search
        size={14}
        className="pointer-events-none absolute left-3 text-gousse-muted"
        aria-hidden
      />
      <Input
        type="search"
        aria-label="Filter issuers by name"
        placeholder="Filter issuers…"
        // `pl-8` clears the leading icon, which sits further in now that the
        // field is a pill (issue #97) — the arc would otherwise crowd it.
        className="w-56 pl-8"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
    </div>
  );
}

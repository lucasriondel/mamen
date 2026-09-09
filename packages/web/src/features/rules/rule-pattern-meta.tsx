/**
 * Common regex fragments offered as one-click authoring aids. Clicking a chip
 * splices its `token` into the pattern at the caret (story: make writing a
 * pattern easier than a bare text box). `hint` doubles as the button's
 * accessible name so each chip is addressable in tests/AT.
 */
const REGEX_TOKENS: ReadonlyArray<{
  label: string;
  token: string;
  hint: string;
}> = [
  { label: ".*", token: ".*", hint: "any characters" },
  { label: "\\d+", token: "\\d+", hint: "one or more digits" },
  { label: "\\s", token: "\\s", hint: "a whitespace character" },
  { label: "^", token: "^", hint: "start of string" },
  { label: "$", token: "$", hint: "end of string" },
  { label: "|", token: "|", hint: "either alternative" },
];

/** A hairline divider between the meta line's three groups. */
function Divider() {
  return <span className="h-4 w-px shrink-0 bg-gousse-line" aria-hidden />;
}

/**
 * Inline validity note for the pattern: silent until the user types, then the
 * compile error (as an alert) or a confirmation once the regex is valid.
 */
function PatternValidity({ pattern, error }: { pattern: string; error: string | null }) {
  if (pattern.length === 0) return null;
  if (error !== null) {
    return (
      <span role="alert" className="text-xs text-gousse-high">
        Invalid regular expression — {error}
      </span>
    );
  }
  return <span className="text-xs text-gousse-low">✓ Valid pattern</span>;
}

export interface RulePatternMetaProps {
  /** The trimmed pattern, as the matcher will compile it. */
  pattern: string;
  /** The compile failure, or `null` when the pattern is valid (or empty). */
  patternError: string | null;
  /** The Value field's parse failure, reported here rather than in the bar. */
  valueError: string | null;
  /** Splice a regex fragment into the pattern at the caret. */
  onInsertToken: (token: string) => void;
}

/**
 * The line under the predicate bar: **what the rule compiles to**, whether it
 * compiles, and the one-click fragments for writing it.
 *
 * All three used to be separate stacked blocks. They are one thought — the
 * pattern, checked and edited — so they read as one line directly beneath the
 * field they describe. It is also where the bar's two possible errors surface:
 * the fields themselves only mark `aria-invalid`, so a form with both a broken
 * regex and a bad amount still reports each exactly once.
 */
export function RulePatternMeta({
  pattern,
  patternError,
  valueError,
  onInsertToken,
}: RulePatternMetaProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 text-sm">
      <span className="text-xs text-gousse-muted">Runs as</span>
      <code className="rounded-full bg-gousse-panel px-2.5 py-1 font-mono text-xs text-gousse-ink">
        /{pattern || "…"}/i
      </code>
      <PatternValidity pattern={pattern} error={patternError} />
      {valueError !== null ? (
        <span role="alert" className="text-xs text-gousse-high">
          {valueError}
        </span>
      ) : null}

      <Divider />

      <span className="text-xs text-gousse-muted">Insert</span>
      <div className="flex flex-wrap gap-1.5">
        {REGEX_TOKENS.map((tok) => (
          <button
            key={tok.token}
            type="button"
            className="rounded-full border border-gousse-line px-2.5 py-0.5 font-mono text-xs text-gousse-ink outline-none transition-[transform,border-color] hover:border-gousse-accent focus-visible:ring-2 focus-visible:ring-gousse-accent active:scale-[0.97]"
            aria-label={`Insert ${tok.hint}`}
            title={tok.hint}
            onClick={() => onInsertToken(tok.token)}
          >
            {tok.label}
          </button>
        ))}
      </div>
    </div>
  );
}

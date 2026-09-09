import { type DragEvent, useState } from "react";

/**
 * Where the statement is dropped — one zone for both file kinds, because which
 * kind it is, is read off the file rather than asked of the user.
 *
 * The zone stays on screen so the user can see what is coming, but it is **inert**
 * until the account is settled (issue #181): its input disabled, its drop handler
 * a no-op. A **Statement Format** is account-scoped, so until the account is
 * chosen there is nothing to read the file against and the PDF path cannot even
 * build its extraction prompt.
 *
 * The gate is restated on the drop rather than left to the input, because a drag
 * can reach an inert zone — a disabled input rejects a click, not a drop.
 *
 * The whole thing *is* the file input's label, which is what makes clicking and
 * tabbing reach the input with no handler of its own: drag events have no keyboard
 * equivalent to mirror, so the keyboard route has to be the native one.
 */
export function FileDropZone({
  accepting,
  onFile,
}: {
  /** Whether the account is settled — the one thing the zone waits for. */
  accepting: boolean;
  onFile: (file: File) => void;
}) {
  const [dragging, setDragging] = useState(false);

  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragging(false);
    if (!accepting) return;
    const file = event.dataTransfer.files[0];
    if (file) onFile(file);
  };

  return (
    /* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions --
       the drop zone *is* the file input's label; drag events have no keyboard
       equivalent to mirror, and clicking or tabbing still reaches the input. */
    <label
      onDragOver={(event) => {
        event.preventDefault();
        if (accepting) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      aria-disabled={!accepting}
      className={`flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${
        accepting ? "cursor-pointer" : "cursor-not-allowed opacity-60"
      } ${dragging ? "border-gousse-accent bg-gousse-panel" : "border-gousse-line"}`}
    >
      {accepting ? (
        <>
          <span className="font-medium text-gousse-ink">Drop a CSV or PDF statement here</span>
          <span className="text-sm text-gousse-muted">or click to choose a file</span>
        </>
      ) : (
        <>
          <span className="font-medium text-gousse-ink">Pick an account first</span>
          <span className="text-sm text-gousse-muted">
            A statement is read against the account it belongs to.
          </span>
        </>
      )}
      <input
        type="file"
        accept=".csv,text/csv,.pdf,application/pdf"
        className="sr-only"
        aria-label="CSV or PDF statement"
        disabled={!accepting}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
        }}
      />
    </label>
  );
}

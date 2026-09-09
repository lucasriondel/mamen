import { Spinner } from "@/components/ui/spinner";

/**
 * The panel that stands in for the statement while a PDF is being read — the
 * only thing on screen between the file leaving the browser and the rows coming
 * back, on both PDF paths (`extract-start` and `discover-start`).
 *
 * It carries the shared {@link Spinner} rather than a bare sentence. The wait is
 * an AI round-trip measured in seconds, and a line of static text is
 * indistinguishable from a screen that has stopped responding; the turning ring
 * is what says the app is still working. `size={14}` matches the 14px `text-sm`
 * line it sits on, so the ring reads as part of the sentence rather than an
 * ornament beside it.
 *
 * One live region, not two. The `<output>` announces the sentence, and the
 * spinner — which ships its own `role="status"` and `aria-label` — is hidden
 * from the accessibility tree here, because a screen reader that hears
 * "Loading" and then the sentence has been told the same thing twice. The
 * sentence is the better half: it names the file.
 *
 * Its own module rather than inline JSX in the upload step: that step is already
 * five panels long, and this is the one piece of it whose whole job is to say
 * that something is in flight.
 */
export function ExtractionProgress({ fileName, label }: { fileName: string; label: string }) {
  return (
    <output className="flex items-center gap-2 rounded-2xl border border-gousse-line bg-gousse-panel p-4 text-sm text-gousse-muted">
      <span aria-hidden className="shrink-0">
        <Spinner size={14} />
      </span>
      <span>
        <span className="font-medium text-gousse-ink">{fileName}</span> — {label}
      </span>
    </output>
  );
}

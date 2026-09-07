import { useEffect, useState } from "react";

/**
 * The source **PDF** in the browser's own viewer, via a revocable blob URL — the
 * left pane of **side-by-side validation** since issue #34, and the leftmost of
 * the three-pane **mapping step** since issue #219.
 *
 * No pdfjs. The browser already renders PDFs, so what this is, is a blob of the
 * file the user picked handed to that viewer; the pane it fills scrolls the
 * document inside itself.
 *
 * Its own module because two steps now show the same statement for the same
 * reason — the rows beside it are a *reading* of it, and the reading is only
 * checkable against the thing read. A second copy of nine lines is a second
 * place for the object URL to leak: the revoke rides the effect's cleanup, so
 * the URL lives exactly as long as the pane does.
 */
export function PdfPane({ file }: { file: File }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  return (
    // The src is a blob of the file the user just picked, rendered by the
    // browser's own PDF viewer — and every sandbox value strict enough to
    // satisfy the rule stops that viewer running.
    // oxlint-disable-next-line react/iframe-missing-sandbox
    <iframe
      title="PDF statement"
      src={url ?? undefined}
      // Its pane's full height, wherever the divider leaves that pane: the
      // native viewer scrolls the document inside it (issue #210).
      className="h-full w-full rounded-2xl border border-gousse-line bg-gousse-panel"
    />
  );
}

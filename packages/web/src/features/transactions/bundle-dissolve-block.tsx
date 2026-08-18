import { Button } from "@/components/ui/button";

export type BundleDissolveBlockProps = {
  /** True while any write on the bundle is in flight. */
  disabled: boolean;
  /** True while *this* write is in flight — what the button says it is doing. */
  isDissolving: boolean;
  onDissolve: () => void;
};

/**
 * **Dissolving** a bundle (issue #74): the parent row goes and every member
 * comes back to the list, exactly as it was. The same thing happens by itself
 * when a bundle would be left standing for a single transaction.
 *
 * Dissolving is not deleting, and the copy says so before the button is pressed:
 * the members are the real bank rows, and they are exactly what comes back. The
 * parent — a synthetic row that only ever stood for them — is the one thing that
 * goes. Nothing is confirmed twice, because nothing is lost.
 */
export function BundleDissolveBlock({
  disabled,
  isDissolving,
  onDissolve,
}: BundleDissolveBlockProps) {
  return (
    <div className="flex flex-col gap-2 border-t border-gousse-line pt-4">
      <p className="text-sm text-gousse-muted">
        Dissolving this bundle deletes this row and returns its members to the list, exactly as they
        were.
      </p>
      <Button
        variant="danger"
        size="sm"
        className="self-start"
        disabled={disabled}
        onClick={onDissolve}
      >
        {isDissolving ? "Dissolving…" : "Dissolve bundle"}
      </Button>
    </div>
  );
}

/**
 * Circular loading spinner — gousse's, vendored from the registry (ADR 0003) as
 * a dependency of `saved-flash` and `credential-tile`. A hand-rolled
 * `animate-spin` ring with `role="status"` and the `border-t-gousse-accent`
 * accent tick; `size` is the px diameter.
 *
 * The `role` is suppressed rather than swapped for the `<output>` the lint rule
 * suggests: `<output>` is a *form's calculated result*, and this is neither in a
 * form nor a result — it is a live region announcing that something is in
 * flight. The element is also what the ring is drawn on, so changing it changes
 * the shape.
 */
export const Spinner = ({ size = 16 }: { size?: number }) => (
  <span
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- `<output>` is a form's calculated result; see the note above
    role="status"
    aria-label="Loading"
    className="inline-block animate-spin rounded-full border-2 border-gousse-line border-t-gousse-accent"
    style={{ width: size, height: size }}
  />
);

import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface StatementFormatRenameFormProps {
  /** Seeds the field, once, at mount. */
  currentName: string;
  /** A write is in flight — Save won't fire twice. */
  pending: boolean;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}

/**
 * The row's rename state: one field, swapped in where the name was.
 *
 * The same shape as {@link AccountEditForm} minus its second field, and for the
 * same reasons — seeded from the prop **once at mount**, so a background refetch
 * cannot reach into a draft the user is typing (issue #205); trimmed and
 * required, because a format with no name is a row that names nothing.
 *
 * It stays a *rename* rather than growing into an edit form, because the name is
 * genuinely all there is to change: a format's mapping is fixed when it is
 * authored, so this field will not acquire a neighbour the way the account form
 * did.
 */
export function StatementFormatRenameForm({
  currentName,
  pending,
  onSubmit,
  onCancel,
}: StatementFormatRenameFormProps) {
  const [name, setName] = useState(currentName);

  const trimmed = name.trim();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (trimmed.length === 0 || pending) return;
    onSubmit(trimmed);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2">
      <Input
        value={name}
        onChange={(event) => setName(event.target.value)}
        aria-label={`New name for ${currentName}`}
        className="max-w-56"
        // Focus the field the user just opened from the menu — the menu returns
        // focus to its trigger otherwise, and the rename would start with a
        // click already spent.
        // oxlint-disable-next-line jsx-a11y/no-autofocus -- the field the user just opened from the menu, per the note above
        autoFocus
      />
      <Button type="submit" variant="primary" size="sm" disabled={pending || trimmed.length === 0}>
        Save
      </Button>
      <Button variant="secondary" size="sm" type="button" onClick={onCancel}>
        Cancel
      </Button>
    </form>
  );
}

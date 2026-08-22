import type { Account } from "@mamen/shared/contract";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatIban, ibanPayload } from "./account-iban";
import { IbanField } from "./iban-field";

export interface AccountEditFormProps {
  account: Account;
  /** A write is in flight — the Save button says so and won't fire twice. */
  pending: boolean;
  onSubmit: (changes: { name: string; iban: string | null }) => void;
  onCancel: () => void;
}

/**
 * The card's edit state: the account's name and its IBAN, as one form.
 *
 * This started as a rename form — a single field welded into the card's own
 * `return`. It is its own component now because it grew a second field, and
 * because the two must submit together: a name write and an IBAN write would be
 * two invalidations and a frame where the card shows the new name beside the old
 * IBAN.
 *
 * Both fields are seeded from the account **once, at mount** — the caller mounts
 * this only while its card is editing, so an open form is a draft the user owns
 * and a later `account` prop (a background refetch's) does not reach into it
 * (issue #205). Both are sent on every submit, so clearing the IBAN clears it on
 * the server (`null`, not "unchanged"). The name is still required — an account
 * with no name is unusable — while an empty IBAN is a legitimate answer, which is
 * why only the former can block the submit. The IBAN seeds in its *grouped* form:
 * the user is about to read it against a statement, and a 27-character run is
 * exactly what they cannot check.
 */
export function AccountEditForm({ account, pending, onSubmit, onCancel }: AccountEditFormProps) {
  const [name, setName] = useState(account.name);
  const [iban, setIban] = useState(account.iban ? formatIban(account.iban) : "");

  const trimmed = name.trim();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (trimmed.length === 0 || pending) return;
    onSubmit({ name: trimmed, iban: ibanPayload(iban) });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-gousse-muted text-sm">
        Name
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-label="New account name"
          className="max-w-56"
          // Focus the field the user just opened from the menu — the menu
          // returns focus to its trigger otherwise, and the edit would
          // start with a click already spent.
          // oxlint-disable-next-line jsx-a11y/no-autofocus -- the field the user just opened from the menu, per the note above
          autoFocus
        />
      </label>

      <IbanField value={iban} onChange={setIban} />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="submit"
          variant="primary"
          size="sm"
          disabled={pending || trimmed.length === 0}
        >
          Save
        </Button>
        <Button variant="secondary" size="sm" type="button" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

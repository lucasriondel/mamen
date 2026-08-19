import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ibanPayload } from "./account-iban";
import { ACCOUNT_TYPE_OPTIONS, type AccountType } from "./account-type";
import { IbanField } from "./iban-field";
import { useAccountMutations } from "./use-account-mutations";

/**
 * Create an account: a name, a type and an optional IBAN, in a modal opened by
 * the list's ghost tile (issue #131).
 *
 * The same two fields the always-open form above the list used to carry, moved
 * behind the gesture that wants them — the create path is unchanged, so the
 * `{ name, type }` payload and the mutation's own invalidation are exactly as
 * they were. The name is trimmed and required (an empty submit is a no-op, and
 * the button says so), and the dialog closes only on a successful create: a
 * refused write surfaces as a toast from the mutation hook and leaves the draft
 * where the user can fix it.
 *
 * The IBAN *is* asked for here, where the colour is not, and the difference is
 * that one is data the user already has in front of them and the other is a
 * decision about an object that does not exist yet. Someone adding an account is
 * reading a statement; the IBAN is on it. It stays optional — an empty field
 * sends nothing and the account is created without one.
 *
 * No colour field. A new account resolves to a stable colour from its id, and
 * the card's swatch is the place that is changed — asking here would be a
 * decision made before the account exists to look at.
 */
export function AddAccountDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { create } = useAccountMutations();
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("checking");
  const [iban, setIban] = useState("");

  const trimmed = name.trim();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (trimmed.length === 0 || create.isPending) return;
    create.mutate(
      { name: trimmed, type, iban: ibanPayload(iban) },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>New account</DialogTitle>
            <DialogDescription>
              Name it and say what kind of account it is. The IBAN is optional, and you can recolour
              it from its card afterwards.
            </DialogDescription>
          </DialogHeader>

          <label className="flex flex-col gap-1 text-gousse-muted text-sm">
            Name
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Everyday checking"
              aria-label="Account name"
              // The field the dialog exists to fill.
              // oxlint-disable-next-line jsx-a11y/no-autofocus -- the field the dialog exists to fill, per the note above
              autoFocus
            />
          </label>

          <label className="flex flex-col gap-1 text-gousse-muted text-sm">
            Type
            <Select
              value={type}
              onChange={(event) => setType(event.target.value as AccountType)}
              aria-label="Account type"
            >
              {ACCOUNT_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </label>

          <IbanField value={iban} onChange={setIban} />

          <DialogFooter>
            <Button variant="secondary" type="button" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              disabled={create.isPending || trimmed.length === 0}
            >
              Add account
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

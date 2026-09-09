import type { StatementFormat } from "@mamen/shared/contract";
import { useEffect, useRef } from "react";
import { suggestedFormatName } from "./parsers/suggested-format-name";
import type { WizardAction } from "./wizard-reducer";

/**
 * Seed a blank draft's name with {@link suggestedFormatName}, once per draft.
 *
 * The seed is written **into the draft** rather than shown as a placeholder or
 * held as a second piece of local state beside it. A placeholder is grey text
 * that does not get saved, so a user who accepted the suggestion by not touching
 * it would find the format stored unnamed — the field would have been lying
 * about what the commit was going to do. Writing it through the reducer keeps
 * one source of truth: what the input shows is what {@link draftCreate} sends.
 *
 * "Once per draft" is the whole of the do-not-clobber rule, and the reducer
 * makes it cheap to state. A draft is born blank and is *replaced with `null`*
 * whenever the thing it was built for changes — another file, another account,
 * an abandoned build — so a non-empty name can only have come from this seed or
 * from the user, and either way it is an answer that already exists. Hence the
 * two guards, which between them cover every re-render this can see:
 *
 * - `name !== ""` skips a draft that has been named, whether by the user typing
 *   over the suggestion or by this hook a moment ago. It is also what makes
 *   *clearing the field* stick for as long as the draft lives — the effect is
 *   not re-armed by an empty name, only by a new draft.
 * - `seeded` remembers the draft this ran for, so the accounts query resolving a
 *   moment after mount — the one race here, since the account's *name* comes off
 *   the network while its id was in hand all along — does not re-fire the seed
 *   against a field the user has already emptied.
 *
 * When the account changes the reducer drops the draft, so the next one is
 * seeded afresh from the new account. That is not this hook overwriting an
 * edit: there is no draft left to overwrite.
 *
 * `accountName` is `null` until the accounts query answers; the seed simply
 * waits for it, since a draft named `CSV` that could have been named
 * `Boursorama CSV` is a worse suggestion than one that arrives a tick later.
 */
export function useSuggestedFormatName({
  draftName,
  draftKind,
  accountName,
  dispatch,
}: {
  /** The live draft's name, or `null` when there is no draft to seed. */
  draftName: string | null;
  draftKind: StatementFormat["kind"] | null;
  /** The chosen account's name, or `null` while it is unknown or unchosen. */
  accountName: string | null;
  dispatch: (action: WizardAction) => void;
}) {
  // Which draft the seed was already spent on. Reset when the draft goes away,
  // so the next one gets its own suggestion.
  const seeded = useRef(false);

  useEffect(() => {
    if (draftName === null || draftKind === null) {
      seeded.current = false;
      return;
    }
    if (seeded.current || draftName !== "" || accountName === null) return;

    seeded.current = true;
    dispatch({
      type: "update-format-draft",
      patch: { name: suggestedFormatName(accountName, draftKind) },
    });
  }, [draftName, draftKind, accountName, dispatch]);
}

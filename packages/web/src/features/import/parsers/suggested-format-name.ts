import type { StatementFormat } from "@mamen/shared/contract";

/**
 * The name a **Statement Format** is offered when the mapping step opens on a
 * blank draft — `Boursorama CSV`, `Revolut PDF`.
 *
 * A suggestion, not an answer. The name is the one field of the draft the app
 * has no way to derive from the file (PRD #180 requires it precisely because two
 * formats for one bank have to be told apart), and yet the overwhelmingly common
 * first format for an account is *that account's statements, in that file kind*.
 * Making the user type what the wizard already knows is the kind of blank field
 * that reads as an interrogation; seeding it turns the required question into a
 * confirmation, and the user overwrites it the moment the guess is wrong.
 *
 * Both halves are the copy the rest of the app already uses: the account's own
 * name as the user typed it, and the file kind spelled the way every visible
 * string in the import surface spells it — `CSV`, `PDF`, upper-case, never
 * `csv`. The union's own tags are lower-case, which is why this maps rather than
 * interpolates: the stored discriminant and the word on screen are two different
 * vocabularies that happen to share letters.
 *
 * With **no account chosen** the suggestion is the file kind alone rather than
 * a name with a hole in it. That case is close to unreachable — the account is
 * settled before a file is taken (issue #181) — but "PDF" is a name a user can
 * accept, extend or replace, whereas `undefined PDF` is a bug on screen, and the
 * fallback that renders a defensible string costs one `??`.
 */
export function suggestedFormatName(
  accountName: string | null,
  kind: StatementFormat["kind"],
): string {
  const fileKind = kind === "pdf" ? "PDF" : "CSV";
  const account = accountName?.trim() ?? "";
  return account === "" ? fileKind : `${account} ${fileKind}`;
}

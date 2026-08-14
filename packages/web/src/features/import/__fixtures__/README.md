# Import fixtures

Sample statements for the parsers under `../parsers/`. **Everything here is
synthetic and must stay that way.**

`green-got-sample.csv` was not, until issue #108: it was a byte-identical copy
of a real Green-Got export, carrying live IBANs, counterparty names and payment
references, and it sat here for months because a file in `__fixtures__/` reads
as sample data by its location alone.

A real export is the easiest thing in the world to drop in here — it is exactly
the file you have open when you are writing a parser. If you need one to work
against, keep it outside the repo (the root `.gitignore` blocks
`relev*_de_compte*.csv` anywhere in the tree, and every CSV at the repo root),
and commit a redacted version once the parser is finished.

What a fixture here owes:

- **Invented counterparties.** Placeholder names, not the shops you actually go
  to — a merchant list is as identifying as an account number.
- **IBANs from the reserved range.** Every account number starts `FR7699999`:
  `99999` is not an allocated French bank code and the check digits do not
  validate, so the string cannot be an account that exists.
- **The bank's real column set.** The point of a fixture is the parser's contact
  with the file format, so keep the headers, the quoting and the value shapes
  the bank emits — only the values are invented.

`src/test/bank-statement-scrubbed.test.ts` enforces the first two: it hashes
every file in the repo against the digest of the statement that leaked, and it
holds every French IBAN in the tree to the reserved prefix.

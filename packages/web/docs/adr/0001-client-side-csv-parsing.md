# Client-side CSV parsing, no import endpoint

The API contract is deliberately CSV-agnostic — its only transaction writes are
`create` / `bulkCreate` / `bulkPut`, all taking clean records. So the web client
parses bank-statement CSVs entirely in the browser (papaparse → a pluggable
Statement Parser → `TransactionCreate[]`) and POSTs the batch via
`bulkCreate`. We chose this over adding a `POST /transactions/import` endpoint
because bank-specific column mapping (Green-Got's French headers, the
`DEBIT`/`CREDIT` → signed-amount rule, `Arrondi` handling) is an ingest concern
that does not belong in the shared contract, and keeping it client-side means no
contract/server/SDK churn to onboard a new bank format.

## Consequences

> The two consequences below were rewritten at issue #88 (epic #85). The
> decision above — parse client-side, POST clean records — is unchanged; what
> changed is that the commit stopped deleting. It was a client-orchestrated
> **delete-month-then-insert** (`deleteByAccountMonth` per month in the file,
> then `bulkCreate`), which erased the previous statement's rows whenever two
> statements legitimately overlapped a month.

- The commit is a client-orchestrated **insert**: one `bulkCreate` for the whole
  parsed batch, no delete. Not a server transaction either, so a mid-batch
  failure leaves some rows written — recoverable with the transaction list's
  bulk delete, and strictly better than a month wiped with nothing reinserted.
- There is no server-side dedup, and no idempotency mechanism at all. The bank's
  transaction id (`N° transaction`) is dropped — the contract has no external-id
  field — so committing the same statement twice duplicates its rows. The guard
  is advisory: the preview warns about rows that look already-imported and
  removes nothing. Erasing rows is only ever the user's action.

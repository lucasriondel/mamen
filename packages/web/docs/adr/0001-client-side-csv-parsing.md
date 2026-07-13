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

- Idempotent re-import is a client-orchestrated **delete-month-then-insert**
  (`deleteByAccountMonth` per month in the file, then `bulkCreate`), not a
  server transaction. A crash between the two leaves the month partially wiped.
- There is no server-side dedup. The bank's transaction id (`N° transaction`) is
  dropped — the contract has no external-id field — so replace-by-month is the
  only idempotency mechanism.

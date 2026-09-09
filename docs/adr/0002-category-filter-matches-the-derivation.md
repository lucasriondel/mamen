# Filtering transactions by category matches the derivation

`GET /transactions?categoryId=…` filters the **derived** category — the same
`CASE WHEN t.manualCategory = 1 THEN t.categoryId ELSE i.defaultCategoryId END`
the list already returns — rather than the stored `t.categoryId` column. The
filter now lives inside that expression, and `countQuery` gains the issuer join
it lacked. The filter also accepts a **set** of category ids, so a folder's page
can list its leaves' transactions in one query.

Before this, the read and the filter disagreed: the list returned derived values
while the filter matched the stored column, so filtering by category returned
only transactions carrying a manual override and silently omitted every
transaction categorised through its issuer — the common case. A category page
built on it would have shown a near-empty list and a wrong total while looking
like it worked.

## Consequences

- A `CASE` in a `WHERE` cannot use an index, so category-filtered queries scan
  the joined set. Acceptable at one person's bank statements; the first thing to
  revisit if that stops being true.
- The count and the list must keep the same join and the same expression. They
  drifted apart once already, which is what caused this.

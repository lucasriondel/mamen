---
id: 6
title: Design the new REST contract
state: open
labels: [wayfinder:grilling]
assignee: none
parent: 1
blocked-by: [2, 3, 4, 5]
---

## Question

What is the full new REST contract — every resource, endpoint, schema? Wire compatibility is explicitly NOT required; redesign freely. To decide with the user (grilling + domain-modeling), resource by resource, using the [inventory](0004-inventory-current-api-surface.md) as the checklist:

- Final resource list and boundaries — does the transactions query-param fan-out become one list endpoint with composable filters? Do settings/app-settings merge?
- Per endpoint: method, path, query/path-param schemas, payload schema, success schema + status, which taxonomy errors it can return.
- List endpoints: filter params (composable, not either/or dispatch), ordering, any pagination (or explicitly none).
- Upload endpoints per the [uploads research](0003-uploads-static-files-under-httpapi.md).
- ID types (numeric today), date handling (replacing the date-parser plugin with Schema.Date semantics), nullability conventions.
- What dead endpoints from the inventory get dropped.

Resolution is a contract spec document (linked asset, e.g. `docs/research/api-contract.md`) precise enough that a per-resource port ticket needs no further contract decisions. On close: graduate the per-resource port tickets from the map's fog.

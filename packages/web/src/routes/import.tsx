import { createFileRoute } from "@tanstack/react-router";
import { ImportView } from "@/features/import/import-view";
import { validateImportSearch } from "@/features/import/search";

/**
 * The import route. Owns a typed `accountId` search param so the accounts import
 * grid can deep-link `/import?accountId=…` to pre-select the wizard's account
 * (issue #36); a plain visit has no params and starts the wizard empty.
 */
export const Route = createFileRoute("/import")({
  validateSearch: validateImportSearch,
  component: ImportView,
});

import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { aiTaskQueries, secretQueries } from "@/lib/sdk";
import { CredentialsGrid } from "./credentials-grid";
import { TaskSettingsCard } from "./task-settings-card";

/**
 * The **AI settings** (issue #120, PRD #115) — where a user stores a credential
 * per AI provider and chooses, per AI task, which provider and model runs it.
 *
 * Two sections, in the order the decisions are made: credentials first, because
 * storing one is what makes a provider selectable below, and the task rows
 * second. Both read the same `GET /secrets` list — the grid renders it as
 * status, the rows read it as "which of these may I offer" — so it is fetched
 * once here and passed down rather than queried twice.
 *
 * It was the whole of `/settings` until issue #127, and is now the second half
 * of {@link SettingsView}: the page owns the title, the width and the order, so
 * what is left here is the two sections and their own headings.
 *
 * Every visible part is built from gousse's vendored components (ADR 0003):
 * `CredentialTile`/`CredentialGrid`, `SecretField`, `ProviderMark`,
 * `SettingsCard`/`SettingRow` and `ModelRow`. They were built for exactly this
 * screen, and mamen should not grow a second implementation of any of them.
 */
export function AiSettingsView() {
  const secrets = useQuery(secretQueries.list());
  const tasks = useQuery(aiTaskQueries.list());

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-gousse-ink">Credentials</h2>
        {secrets.isError ? (
          <ReadFailure what="your stored credentials" onRetry={() => secrets.refetch()} />
        ) : (
          <CredentialsGrid statuses={secrets.data ?? []} loading={secrets.isPending} />
        )}
        <p className="text-xs text-gousse-muted">
          Credentials are encrypted before they are stored and never come back out of the server —
          only the masked hint above.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-gousse-ink">Tasks</h2>
        {tasks.isError ? (
          <ReadFailure what="your AI task settings" onRetry={() => tasks.refetch()} />
        ) : (
          <TaskSettingsCard
            settings={tasks.data ?? []}
            statuses={secrets.data ?? []}
            // Nothing is savable until both reads have landed: the picker would
            // otherwise offer the default over a credential list it does not
            // have yet, and a change made against it would be a change the user
            // did not mean.
            disabled={tasks.isPending || secrets.isPending}
          />
        )}
      </section>
    </div>
  );
}

/** A failed read, in the app's inline shape — writes surface on the control. */
function ReadFailure({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-gousse-line bg-gousse-panel p-6 text-center">
      <p className="font-medium text-gousse-ink">Couldn't load {what}.</p>
      <Button variant="secondary" size="sm" className="mt-3" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

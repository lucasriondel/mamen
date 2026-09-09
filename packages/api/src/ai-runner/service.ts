import { SqlClient } from "@effect/sql";
import { makeTaskRunner } from "ai-task-runner-effect";
import { Effect, Option } from "effect";
import { TaskProvider } from "../ai-tasks";
import { readSecret } from "../secrets/repository";
import { HostedTransport } from "./hosted";
import { AI_TASK_TABLE, type AiRun, RUN_TASK } from "./tasks";

/**
 * The **AI runner** (issue #121, PRD #115) — mamen's one seam onto
 * `ai-task-runner-effect`.
 *
 * The package is deliberately a factory rather than an `Effect.Tag`, so the
 * injection seam belongs here; this is it, and there is exactly one. Everything
 * it supplies is a decision made in an earlier ticket:
 *
 * - **`resolve` is the task-provider resolver** (#119). The runner asks the same
 *   question the settings page's save-time doors answer, so a choice a door
 *   accepted is one the runner runs, and a task that cannot run says so with the
 *   same rejection.
 * - **`credential` is the secrets module's inward plaintext reader** (#117) —
 *   the deep import into `secrets/repository.ts` is the point, not an oversight:
 *   `readSecret` is off the barrel so reaching it is a line that shows up in a
 *   review, and this is the one place in mamen that does. It stays `Redacted`
 *   until the transport that spends it unwraps it, and `none` becomes the
 *   `null` the runner reads as "not runnable".
 * - **`generateHosted` is left to the package** (#124). Both branches are wired
 *   now, and the hosted one is the package's own ai-sdk call; the only reason
 *   mamen names it at all is {@link HostedTransport}, the test seam.
 *
 * Nothing here decrypts, and nothing here holds a key: `readSecret` is called
 * and its answer is handed straight on, which leaves the single-decryptor rule
 * (ADR 0011) where #117 put it.
 */

export class AiRunner extends Effect.Service<AiRunner>()("api/AiRunner", {
  effect: Effect.gen(function* () {
    const tasks = yield* TaskProvider;
    // Closed over rather than required per call, so `run`'s remaining
    // requirement is `ClaudeCode` alone — which is what lets the extraction
    // handler narrow that one service to its temp dir at the call site.
    const sql = yield* SqlClient.SqlClient;

    /**
     * The hosted branch's one HTTP call (issue #124). Absent in production, so
     * the package's own ai-sdk call runs and a statement really does reach the
     * vendor the user chose; present only when a test provides
     * {@link HostedTransport}, which is where "what reached the vendor" is
     * asserted.
     */
    const hosted = yield* Effect.serviceOption(HostedTransport);

    const runner = makeTaskRunner(
      AI_TASK_TABLE,
      {
        // The table is keyed by `AiRun`, so its keys are the only strings the
        // runner can pass back here — and each names the **AI task** whose
        // stored provider and model it spends (`RUN_TASK`). Discovery runs on
        // the extraction choice: same file, same vendor, one card on the
        // settings page (issue #217).
        resolve: (run) => tasks.resolve(RUN_TASK[run as AiRun]),
        credential: (vendor) =>
          readSecret(vendor).pipe(
            Effect.provideService(SqlClient.SqlClient, sql),
            Effect.map(Option.getOrNull),
          ),
      },
      // Omitted rather than passed as `undefined`: the package reads
      // `internals.generateHosted ?? generateHostedLive`, and an absent seam is
      // the live call.
      Option.match(hosted, {
        onNone: () => ({}),
        onSome: (generateHosted) => ({ generateHosted }),
      }),
    );

    return { run: runner.run } as const;
  }),
  dependencies: [TaskProvider.Default],
}) {}

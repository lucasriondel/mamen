import { SqlClient } from "@effect/sql";
import type { AiTask } from "@mamen/shared/contract";
import { type HostedGenerate, makeTaskRunner } from "ai-task-runner-effect";
import { Effect, Option } from "effect";
import { TaskProvider } from "../ai-tasks";
import { readSecret } from "../secrets/repository";
import { AI_TASK_TABLE } from "./tasks";

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
 *
 * Nothing here decrypts, and nothing here holds a key: `readSecret` is called
 * and its answer is handed straight on, which leaves the single-decryptor rule
 * (ADR 0011) where #117 put it.
 */

/**
 * The hosted transport, refused before it can reach a vendor.
 *
 * `makeTaskRunner`'s third argument substitutes the one HTTP call; the package
 * offers it so a test can fake the seam, and mamen uses it for the same reason
 * from the other direction — **the hosted branch is not wired** (PRD #115: a
 * statement can only reach a vendor as a document part, which is blocked on the
 * upstream package). Without this, a user who selects Anthropic today would have
 * their bank statement posted to a vendor under a prompt that names a path on
 * this machine and asks for a tool the vendor does not have: a real request,
 * spending their key, that could not have worked.
 *
 * So the run fails instead, and the statement never leaves the machine. The
 * failure is a `HostedApiError`, which collapses to the one client-visible
 * `ExtractionFailed` like every other upstream tag.
 */
const refuseHosted: HostedGenerate = ({ vendor }) =>
	Promise.reject(
		new Error(
			`the ${vendor} transport is not wired yet — extraction runs on the local Claude Code CLI`,
		),
	);

export class AiRunner extends Effect.Service<AiRunner>()("api/AiRunner", {
	effect: Effect.gen(function* () {
		const tasks = yield* TaskProvider;
		// Closed over rather than required per call, so `run`'s remaining
		// requirement is `ClaudeCode` alone — which is what lets the extraction
		// handler narrow that one service to its temp dir at the call site.
		const sql = yield* SqlClient.SqlClient;

		const runner = makeTaskRunner(
			AI_TASK_TABLE,
			{
				// The table is keyed by `AiTask`, so its keys are the only strings the
				// runner can pass back here.
				resolve: (task) => tasks.resolve(task as AiTask),
				credential: (vendor) =>
					readSecret(vendor).pipe(
						Effect.provideService(SqlClient.SqlClient, sql),
						Effect.map(Option.getOrNull),
					),
			},
			{ generateHosted: refuseHosted },
		);

		return { run: runner.run } as const;
	}),
	dependencies: [TaskProvider.Default],
}) {}

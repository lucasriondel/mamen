import { BunContext } from "@effect/platform-bun";
import { ClaudeCodeLive, ClaudeConfigLive } from "claude-code-effect";
import { Layer } from "effect";

/**
 * The production `ClaudeCode` service, self-contained: `ClaudeConfigLive` reads
 * the config (incl. the required `CLAUDE_CODE_OAUTH_TOKEN`) from the
 * environment, and `BunContext.layer` supplies the `CommandExecutor` the CLI
 * spawn needs. Only `ClaudeCode` is exposed — the platform context provided
 * here is not re-exported.
 *
 * A missing token fails this layer at **build** with `ClaudeTokenMissingError`
 * (the SDK's designed build-time check), which surfaces on `ServerLive`.
 *
 * Tests never use this: they provide `ClaudeCode` through `ClaudeCodeTest`'s
 * deep-fake executor instead, so no real binary or token is needed in CI.
 *
 * The `claude` CLI + token are a runtime **operational dependency** (local dev
 * and deploy); see `docs/operations/claude-cli-dependency.md` and ADR 0005.
 */
export const ClaudeCodeProdLive = ClaudeCodeLive.pipe(
	Layer.provide(ClaudeConfigLive),
	Layer.provide(BunContext.layer),
);

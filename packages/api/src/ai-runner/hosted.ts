import type { HostedGenerate } from "ai-task-runner-effect";
import { Context } from "effect";

/**
 * The **hosted transport seam** (issue #124, PRD #115) — the one new seam this
 * feature adds, and the only one.
 *
 * `makeTaskRunner`'s third argument substitutes the single HTTP call the hosted
 * branch makes; the package offers it precisely so a test can assert *what
 * reached the vendor* rather than how it got there. That argument is a plain
 * function, so mamen needs somewhere to put a test's fake — this tag is it.
 *
 * It is **optional on purpose**. {@link AiRunner} reads it with
 * `Effect.serviceOption`, so production provides nothing and the package's own
 * ai-sdk call runs; a test provides `Layer.succeed(HostedTransport, fake)` and
 * nothing else about the wiring changes. Making it required would mean mamen
 * naming a live layer for a call `generateHostedLive` already is — and that
 * function is not on the package's barrel, so mamen would have to reimplement
 * the vendor switch it exists to own.
 *
 * Nothing in `src/` provides it. That is the property worth keeping: a fake
 * hosted transport can only be introduced by a test, in one line a reviewer
 * sees.
 */
export class HostedTransport extends Context.Tag("api/HostedTransport")<
  HostedTransport,
  HostedGenerate
>() {}

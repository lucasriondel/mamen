import type { AiProvider, AiTask } from "@mamen/shared/contract";
import { AI_PROVIDER_LABELS } from "@mamen/shared/contract";

/**
 * The words the AI settings page puts around the catalogue (issue #120,
 * PRD #115).
 *
 * The catalogue itself — which providers exist, what they are called, which
 * models they serve, which tasks there are — lives in `@mamen/shared/contract`
 * and is read straight from there. What is here is everything that is *only*
 * true on screen: what kind of credential a provider issues, where a user goes
 * to get one, and how a task reads in a sentence. Kept out of the shared leaf
 * because none of it is a fact the API validates against, and a wording change
 * should not touch a module the save-time doors import.
 */

/** What the credential *is*, per provider — shown under the provider's name. */
export const CREDENTIAL_KIND: { readonly [P in AiProvider]: string } = {
  // Not an API key: the local CLI authenticates with an OAuth token minted by
  // `claude setup-token`, and calling it a key would send the user to the
  // Anthropic console for the wrong thing.
  "claude-code": "OAuth token",
  anthropic: "API key",
  google: "API key",
  openai: "API key",
};

/** Where a user gets one. Shown only while the tile is unset. */
export const CREDENTIAL_SOURCE: { readonly [P in AiProvider]: string } = {
  "claude-code": "Run `claude setup-token` locally",
  anthropic: "console.anthropic.com",
  google: "aistudio.google.com",
  openai: "platform.openai.com",
};

/**
 * The accessible name of a provider's paste field, and the string the tests
 * reach it by. Built from the label and the kind so there is one spelling of
 * "Anthropic API key" rather than a second table to keep in step.
 */
export const credentialFieldLabel = (provider: AiProvider): string =>
  `${AI_PROVIDER_LABELS[provider]} ${CREDENTIAL_KIND[provider]}`;

/** What a task is called on screen, and what it does, in one line each. */
export const AI_TASK_COPY: {
  readonly [T in AiTask]: {
    readonly title: string;
    readonly description: string;
  };
} = {
  "extract-pdf": {
    title: "PDF statement extraction",
    description: "Reads transactions out of an uploaded PDF bank statement.",
  },
};

/**
 * The privacy notice a hosted vendor carries.
 *
 * Today a bank statement never leaves the machine, and choosing a hosted vendor
 * is what changes that. The PRD asks for it to read as a deliberate choice
 * rather than something discovered later, so the sentence names the vendor and
 * says what is sent — not "data may be processed by third parties".
 *
 * One text node on purpose: a sentence broken across elements to emphasise the
 * vendor is a sentence a screen reader reads in pieces.
 */
export const hostedVendorNotice = (provider: AiProvider): string =>
  `Your bank statement will be sent to ${AI_PROVIDER_LABELS[provider]} for extraction.`;

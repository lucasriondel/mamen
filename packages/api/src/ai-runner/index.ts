/**
 * The AI-runner module's barrel: the one service tag, plus the one seam a test
 * fills.
 *
 * The task table, the codec adapter and the extraction prompts are the inside of
 * it — each is reached by its own test, and every production caller goes through
 * {@link AiRunner}. {@link HostedTransport} is on the barrel because its whole
 * purpose is to be provided from outside this module, and a seam reached by a
 * deep import is one nobody sees in a review.
 */
export { HostedTransport } from "./hosted";
export { AiRunner } from "./service";

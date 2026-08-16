/**
 * The AI-runner module's barrel: the one service tag, which is the only thing
 * outside this module has business with.
 *
 * The task table, the codec adapter and the extraction prompt are the inside of
 * it — each is reached by its own test, and every production caller goes through
 * {@link AiRunner}.
 */
export { AiRunner } from "./service";

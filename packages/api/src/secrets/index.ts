/**
 * The secrets module's **barrel** — its public surface, and deliberately only
 * half of what `repository.ts` exports (issue #117, ADR 0011).
 *
 * What is here is outward-facing: the group layer and the repository whose every
 * method answers with a `SecretStatus` — a boolean and a masked hint.
 *
 * What is **not** here is `readSecret`, the inward plaintext reader. It is not
 * an oversight and it is not private: an in-process caller that is about to
 * spend a credential at a vendor imports it from `./secrets/repository`
 * directly, which is a line that says what it is doing and shows up in a review.
 * `boundary.test.ts` holds this file to it.
 */
export { SecretsLive } from "./handlers";
export { SecretsRepo } from "./repository";

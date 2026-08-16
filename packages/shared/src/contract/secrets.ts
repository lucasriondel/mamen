import {
	HttpApiEndpoint,
	HttpApiGroup,
	HttpApiSchema,
	OpenApi,
} from "@effect/platform";
import { Schema } from "effect";
import { AiProvider } from "./ai";
import { SecretRejected } from "./errors";

/**
 * The set of stored credentials, by name — **the AI provider set itself**
 * (issue #118). Every secret mamen holds is some provider's credential, and the
 * lookup is keyed by provider because the code fetching a key has to be able to
 * say whose key it wants. So this is an alias, not a second literal: a provider
 * added to the catalogue is a provider a credential can be stored for, with
 * nothing here to keep in step.
 *
 * A `Schema.Literal` in path position, like `SettingKey`: an unknown provider
 * fails decode and is a 400, rather than reaching a handler that has to invent
 * an answer for a vendor nobody defined — or writing a row under a name nothing
 * can ever read back.
 */
export const SecretName = AiProvider;
export type SecretName = AiProvider;

/**
 * The shortest paste a save accepts. Anything shorter is not a credential any
 * vendor issues — it is a stray paste, a truncated copy or an empty clipboard —
 * and refusing it here is what keeps the failure at the field the user is
 * looking at instead of at their next import.
 *
 * Deliberately generous and vendor-agnostic: a per-vendor prefix check
 * (`sk-ant-…`) would refuse a legitimate key the day a vendor changes its
 * format, and the only honest test of a credential is a run.
 */
export const SECRET_MIN_LENGTH = 8;

/**
 * The shortest stored secret that gets a **hint** at all. Separate from
 * {@link SECRET_MIN_LENGTH}, and larger, on purpose: masking shows ten
 * characters (first seven plus last three), so hinting a twelve-character
 * credential would show most of it. Below this length a stored secret reports
 * `configured: true` with a `null` hint — stored fine, shown never.
 */
export const SECRET_HINT_MIN_LENGTH = 20;

/**
 * What a stored credential looks like **outward** — to an HTTP handler, the SDK
 * and the browser. A boolean and a masked hint; never the secret, and never the
 * ciphertext. This is the whole outward vocabulary: there is no endpoint,
 * anywhere, whose response can carry a stored value (ADR 0011).
 *
 * - `configured` — a row exists for this name.
 * - `hint` — first seven characters, `…`, last three (`sk-ant-…3f9`), or `null`.
 *   `null` means one of two things, and they are deliberately not
 *   distinguished on the wire: the stored value is shorter than
 *   {@link SECRET_HINT_MIN_LENGTH}, or it could not be decrypted. A secret that
 *   will not decrypt reports `configured: true` with a `null` hint — present but
 *   unreadable — rather than absent, so a rotated `TOKEN_ENCRYPTION_KEY` tells
 *   the operator to re-paste instead of implying nothing was ever stored.
 */
export class SecretStatus extends Schema.Class<SecretStatus>("SecretStatus")({
	name: SecretName,
	configured: Schema.Boolean,
	hint: Schema.NullOr(Schema.String),
}) {}

/**
 * The paste itself — the only place in the contract a plaintext secret appears,
 * and it travels in one direction only: into `put`, never back out. Nothing
 * echoes it, not the success body ({@link SecretStatus}) and not the refusal
 * ({@link SecretRejected}, which carries a reason code and no value).
 */
export class SecretValue extends Schema.Class<SecretValue>("SecretValue")({
	value: Schema.String,
}) {}

/**
 * The status of **every** provider's credential, in catalogue order — the whole
 * `AI_PROVIDERS` list, one entry each, whether or not anything is stored
 * (issue #118).
 *
 * Exhaustive rather than "the providers with a row", because the question the
 * settings page asks is "what are my options and which of them can I actually
 * select", and an absent credential is an answer to it. It is also why this is
 * a plain array and not a **paged envelope**: the provider set is a closed
 * literal, not a collection that grows with use.
 */
export const SecretStatuses = Schema.Array(SecretStatus);

/**
 * Secrets group, prefix `/secrets` — store, read the status of, and clear an
 * encrypted credential, per provider, plus read every provider's status at once.
 *
 * `put` is an upsert: pasting over a stored credential replaces it, which is how
 * a leaked key is rotated. `clear` is idempotent — clearing a secret that was
 * never stored is not an error, because "there is no credential here" is the
 * state the caller asked for and it holds either way. Neither declares
 * `NotFound` for that reason; `status` doesn't either, since *absent* is a
 * status, not a missing resource.
 */
export class SecretsGroup extends HttpApiGroup.make("secrets")
	.add(HttpApiEndpoint.get("list")`/secrets`.addSuccess(SecretStatuses))
	.add(
		HttpApiEndpoint.get(
			"status",
		)`/secrets/${HttpApiSchema.param("name", SecretName)}`.addSuccess(
			SecretStatus,
		),
	)
	.add(
		HttpApiEndpoint.put(
			"put",
		)`/secrets/${HttpApiSchema.param("name", SecretName)}`
			.setPayload(SecretValue)
			.addSuccess(SecretStatus)
			.addError(SecretRejected),
	)
	.add(
		HttpApiEndpoint.del(
			"clear",
		)`/secrets/${HttpApiSchema.param("name", SecretName)}`.addSuccess(
			SecretStatus,
		),
	)
	.annotateContext(OpenApi.annotations({ title: "Secrets" })) {}

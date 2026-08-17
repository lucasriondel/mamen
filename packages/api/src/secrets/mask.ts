import { SECRET_HINT_MIN_LENGTH } from "@mamen/shared/contract";

const HEAD = 7;
const TAIL = 3;

/**
 * The **masked hint** for a stored secret: first seven characters, `…`, last
 * three — `sk-ant-…3f9`. `null` below {@link SECRET_HINT_MIN_LENGTH}, where ten
 * shown characters would be most of the value.
 *
 * Masking, not truncation: the head alone identifies a vendor but not *which* of
 * two keys from that vendor is stored, and the tail is what the user actually
 * recognises when comparing against the vendor's own dashboard.
 *
 * This is the one function in the API that reads a plaintext secret and returns
 * something for the wire, so it lives on its own, pure, next to the repository
 * that calls it — reviewable without a database, a layer or an HTTP client in
 * the way.
 */
export const maskSecret = (value: string): string | null =>
	value.length < SECRET_HINT_MIN_LENGTH
		? null
		: `${value.slice(0, HEAD)}…${value.slice(-TAIL)}`;

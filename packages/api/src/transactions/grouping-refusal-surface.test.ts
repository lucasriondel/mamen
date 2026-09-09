import { OpenApi } from "@effect/platform";
import { assert, describe, it } from "@effect/vitest";
import { Api } from "@mamen/shared/contract";

/**
 * **Bundle / transfer-group exclusivity: the error *surface*** (issue #81,
 * follow-up to #75). The rule itself is pinned by behaviour tests — the repo
 * suite for the four refusal directions, the wire suite for the four 422s. This
 * pins the shape those refusals arrive in, which is a separate decision and the
 * one #81 settles: **each grouping raises its own error type**, and neither
 * endpoint's union is widened with the other's.
 *
 * Why per-domain rather than one reused type (the decision, recorded on #81):
 * the `_tag` is the client's discriminant and every endpoint declares exactly
 * the errors it can produce, so raising `TransferInvalid` from `create-bundle`
 * would force every bundle client to handle a type whose other reasons
 * (`too-few-legs`, `unbalanced`, …) it can never receive. #75's AC asked for no
 * *third*, parallel type — and there is none: each direction reuses the 422 its
 * own grouping already raises, with one `reason` added to the existing enum.
 *
 * Read off the generated OpenAPI document, because that is the surface a client
 * actually meets — and `OpenApi.fromApi` is pure, so this needs no server.
 */
const spec = OpenApi.fromApi(Api) as {
  paths: Record<string, Record<string, { responses?: Record<string, { content?: unknown }> }>>;
  components: {
    schemas: Record<string, { properties?: { reason?: { enum?: ReadonlyArray<string> } } }>;
  };
};

/** The `$ref` name of the schema an endpoint answers a given status with. */
const errorSchemaAt = (path: string, status: string): string | undefined => {
  const response = spec.paths[path]?.post?.responses?.[status] as
    | {
        content?: {
          "application/json"?: { schema?: { $ref?: string } };
        };
      }
    | undefined;
  const ref = response?.content?.["application/json"]?.schema?.$ref;
  return ref?.split("/").pop();
};

/**
 * Every schema an endpoint's responses reference, at any depth and any status —
 * a union widened with a second error lands as a `oneOf` under the SAME 422, so
 * reading one status' `$ref` would miss it. The framework's implicit `400`
 * (`HttpApiDecodeError`) and untyped `500` come along; they are on every
 * endpoint and are not part of the domain error set, so the callers filter.
 */
const schemasAt = (path: string): ReadonlyArray<string> => {
  const found: string[] = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) return void node.forEach(walk);
    if (node === null || typeof node !== "object") return;
    for (const [key, value] of Object.entries(node)) {
      if (key === "$ref" && typeof value === "string") found.push(value.split("/").pop() as string);
      else walk(value);
    }
  };
  walk(spec.paths[path]?.post?.responses ?? {});
  return found;
};

const reasonsOf = (schema: string): ReadonlyArray<string> =>
  spec.components.schemas[schema]?.properties?.reason?.enum ?? [];

/** The two grouping refusals, told apart from every other schema by their reasons. */
const GROUPING_ERRORS = ["BundleInvalid", "TransferInvalid"];

const groupingErrorsAt = (path: string): ReadonlyArray<string> =>
  [...new Set(schemasAt(path))].filter((s) => GROUPING_ERRORS.includes(s)).sort();

const BUNDLE_WRITE_PATHS = ["/api/transactions/bundle", "/api/transactions/bundle/add-member"];

describe("grouping refusal surface (issue #81)", () => {
  // The bundling side of the exclusivity, on both of its write paths. A bundle
  // endpoint answers `BundleInvalid` and nothing else at 422 — the refusal is
  // stated in the vocabulary of the endpoint the caller called.
  it("answers the bundle write paths with BundleInvalid alone", () => {
    for (const path of BUNDLE_WRITE_PATHS) {
      assert.strictEqual(
        errorSchemaAt(path, "422"),
        "BundleInvalid",
        `${path} should refuse with BundleInvalid`,
      );
      // A union widened with the transfer error would land as a `oneOf`
      // beside it under the same 422, which the $ref above would not see.
      assert.deepStrictEqual(
        groupingErrorsAt(path),
        ["BundleInvalid"],
        `${path} should declare no grouping error beyond BundleInvalid`,
      );
    }
  });

  // The transfer side, where #75's AC bullet is already literally true.
  it("answers link-transfer with TransferInvalid alone", () => {
    const path = "/api/transactions/link-transfer";
    assert.strictEqual(errorSchemaAt(path, "422"), "TransferInvalid");
    assert.deepStrictEqual(groupingErrorsAt(path), ["TransferInvalid"]);
  });

  // One rule, two vocabularies: each type carries its own side of it and never
  // the other's, so neither enum grows a reason its endpoint cannot raise.
  it("gives each type its own side of the exclusivity reason", () => {
    const bundle = reasonsOf("BundleInvalid");
    const transfer = reasonsOf("TransferInvalid");
    assert.ok(bundle.includes("is-transfer-leg"));
    assert.ok(!bundle.includes("is-bundled"));
    assert.ok(transfer.includes("is-bundled"));
    assert.ok(!transfer.includes("is-transfer-leg"));
  });

  // The part of #75's AC that binds under either direction: one rule must not
  // grow a third error type beside the two the groupings already have.
  it("adds no third grouping-refusal type", () => {
    const carriers = Object.keys(spec.components.schemas).filter((name) =>
      reasonsOf(name).some((r) => r === "is-bundled" || r === "is-transfer-leg"),
    );
    assert.deepStrictEqual(carriers.sort(), GROUPING_ERRORS);
  });
});

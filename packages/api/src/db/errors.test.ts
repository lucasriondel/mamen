import { SqlError } from "@effect/sql/SqlError";
import { assert, describe, it } from "@effect/vitest";
import { Conflict } from "@mamen/shared/contract";
import { Cause, Effect, Exit } from "effect";
import { conflictOrDie, orDieSql } from "./errors";

const sqlError = (message: string) => new SqlError({ cause: new Error(message), message });

describe("conflictOrDie", () => {
  it.effect("maps a UNIQUE violation to a typed Conflict", () =>
    Effect.gen(function* () {
      const error = yield* sqlError("UNIQUE constraint failed: settings.key").pipe(
        Effect.fail,
        conflictOrDie("setting"),
        Effect.flip,
      );
      assert.instanceOf(error, Conflict);
      assert.strictEqual(error.resource, "setting");
    }),
  );

  it.effect("dies (untyped 500) on any other SqlError", () =>
    Effect.gen(function* () {
      const exit = yield* sqlError("database disk image is malformed").pipe(
        Effect.fail,
        conflictOrDie("setting"),
        Effect.exit,
      );
      assert.ok(Exit.isFailure(exit));
      assert.ok(
        Cause.isDie(exit.cause),
        "non-unique SqlError becomes a defect, not a typed failure",
      );
    }),
  );
});

describe("orDieSql", () => {
  it.effect("turns any SqlError into a defect", () =>
    Effect.gen(function* () {
      const exit = yield* sqlError("boom").pipe(Effect.fail, orDieSql, Effect.exit);
      assert.ok(Exit.isFailure(exit) && Cause.isDie(exit.cause));
    }),
  );
});

import { addEqualityTesters } from "@effect/vitest";

// Make `expect(...).toEqual` use Effect's `Equal.equals`, so decoded Schema
// class instances compare by value.
addEqualityTesters();

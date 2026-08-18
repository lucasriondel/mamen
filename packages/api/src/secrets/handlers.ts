import { HttpApiBuilder } from "@effect/platform";
import { Api } from "@mamen/shared/contract";
import { Effect, Layer } from "effect";
import { TaskProvider } from "../ai-tasks";
import { SecretsRepo } from "./repository";

/**
 * Implements the `secrets` group of the contract on {@link SecretsRepo}:
 * `status`, `put` (upsert, refuses a blank or too-short paste) and `clear`
 * (idempotent). Each handler is a thin delegate, as every group layer is — and
 * here that thinness is the security property, not just the house style: the
 * handler has no access to a plaintext secret because the repository's outward
 * surface has no method that returns one, so there is nothing on this side of
 * the boundary to leak (ADR 0011).
 *
 * `clear` is the exception, and deliberately: it delegates to
 * {@link TaskProvider}, not to the repository, because deleting a credential is
 * one of the two ways into a task pointing at a provider that cannot run it
 * (issue #119). The **checked write door** is the only path to the delete, so
 * the rule cannot be walked around by using this endpoint instead of the other
 * one. Nothing about the boundary changes: the door reads credential *presence*
 * through the status boolean and hands back the same `SecretStatus`.
 */
export const SecretsLive = HttpApiBuilder.group(Api, "secrets", (handlers) =>
  Effect.gen(function* () {
    const repo = yield* SecretsRepo;
    const tasks = yield* TaskProvider;
    return handlers
      .handle("list", () => repo.statusAll())
      .handle("status", (_) => repo.status(_.path.name))
      .handle("put", (_) => repo.put(_.path.name, _.payload.value))
      .handle("clear", (_) => tasks.clearCredential(_.path.name));
  }),
).pipe(Layer.provide(SecretsRepo.Default), Layer.provide(TaskProvider.Default));

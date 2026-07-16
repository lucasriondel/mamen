import { HttpApiBuilder } from "@effect/platform";
import { Api } from "@mamen/shared/contract";
import { Effect, Layer } from "effect";
import { CategoryRepo } from "./repository";

/** Implements the `categories` group of the contract on {@link CategoryRepo}. */
export const CategoriesLive = HttpApiBuilder.group(
	Api,
	"categories",
	(handlers) =>
		Effect.gen(function* () {
			const repo = yield* CategoryRepo;
			return handlers
				.handle("list", (_) => repo.list(_.urlParams))
				.handle("getById", (_) => repo.getById(_.path.id))
				.handle("getBySlug", (_) => repo.getBySlug(_.path.slug))
				.handle("create", (_) => repo.create(_.payload))
				.handle("bulkCreate", (_) => repo.bulkCreate(_.payload.records))
				.handle("update", (_) => repo.update(_.path.id, _.payload))
				.handle("spill", (_) => repo.spill(_.path.id, _.payload))
				.handle("remove", (_) => repo.remove(_.path.id));
		}),
).pipe(Layer.provide(CategoryRepo.Default));

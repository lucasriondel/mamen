import { databaseApi } from "../database";
import { defineMutations } from "./factory";

export const databaseMutations = defineMutations({
	reset: {
		mutationFn: () => databaseApi.reset(),
	},
	export: {
		mutationFn: () => databaseApi.export(),
	},
	import: {
		mutationFn: (data: Record<string, unknown>) => databaseApi.import(data),
	},
});

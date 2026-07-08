import { importApi } from "../import";
import { defineMutations } from "./factory";

export const importMutations = defineMutations({
	run: {
		mutationFn: (data: unknown) => importApi.run(data),
	},
});

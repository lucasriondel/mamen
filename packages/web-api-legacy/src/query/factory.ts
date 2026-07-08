import type { QueryKey } from "@tanstack/react-query";
import { invalidateEntity } from "../mutations";
import type { queryKeys } from "../queryKeys";

type EntityName = keyof typeof queryKeys;

type QueryDef<TArgs extends unknown[], TData> = {
	queryKey: (...args: TArgs) => QueryKey;
	queryFn: (...args: TArgs) => Promise<TData>;
};

type MutationDef<TVariables, TData> = {
	mutationFn: (variables: TVariables) => Promise<TData>;
	invalidates?: EntityName[];
};

export const defineQueries = <T extends Record<string, QueryDef<any[], any>>>(
	queries: T,
) => {
	const result = {} as {
		[K in keyof T]: T[K] extends QueryDef<infer TArgs, infer TData>
			? (...args: TArgs) => {
					queryKey: QueryKey;
					queryFn: () => Promise<TData>;
				}
			: never;
	};
	for (const [name, def] of Object.entries(queries)) {
		(result as any)[name] = (...args: any[]) => ({
			queryKey: def.queryKey(...args),
			queryFn: () => def.queryFn(...args),
		});
	}
	return result;
};

export const defineMutations = <
	T extends Record<string, MutationDef<any, any>>,
>(
	mutations: T,
) => {
	const result = {} as {
		[K in keyof T]: T[K] extends MutationDef<infer TVars, infer TData>
			? () => {
					mutationFn: (variables: TVars) => Promise<TData>;
					onSuccess: () => void;
				}
			: never;
	};
	for (const [name, def] of Object.entries(mutations)) {
		(result as any)[name] = () => ({
			mutationFn: def.mutationFn,
			onSuccess: () => {
				if (def.invalidates) {
					invalidateEntity(...def.invalidates);
				}
			},
		});
	}
	return result;
};

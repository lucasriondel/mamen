import { describe, expect, it, vi } from "vitest";
import { defineMutations, defineQueries } from "./factory";

vi.mock("../mutations", () => ({
	invalidateEntity: vi.fn(),
}));

describe("defineQueries", () => {
	it("returns functions that produce queryKey and queryFn", () => {
		const queries = defineQueries({
			list: {
				queryKey: () => ["items", "list"] as const,
				queryFn: () => Promise.resolve([{ id: 1 }]),
			},
			detail: {
				queryKey: (id: number) => ["items", id] as const,
				queryFn: (id: number) => Promise.resolve({ id }),
			},
		});

		const listOpts = queries.list();
		expect(listOpts.queryKey).toEqual(["items", "list"]);
		expect(typeof listOpts.queryFn).toBe("function");

		const detailOpts = queries.detail(42);
		expect(detailOpts.queryKey).toEqual(["items", 42]);
		expect(typeof detailOpts.queryFn).toBe("function");
	});

	it("queryFn calls the original with bound args", async () => {
		const mockFn = vi.fn().mockResolvedValue("result");
		const queries = defineQueries({
			fetch: {
				queryKey: (a: string, b: number) => ["fetch", a, b] as const,
				queryFn: mockFn,
			},
		});

		const opts = queries.fetch("hello", 5);
		const result = await opts.queryFn();

		expect(mockFn).toHaveBeenCalledWith("hello", 5);
		expect(result).toBe("result");
	});
});

describe("defineMutations", () => {
	it("returns functions that produce mutationFn and onSuccess", async () => {
		const { invalidateEntity } = await import("../mutations");
		const mockMutate = vi.fn().mockResolvedValue({ id: 1 });

		const mutations = defineMutations({
			create: {
				mutationFn: mockMutate,
				invalidates: ["merchants"],
			},
		});

		const opts = mutations.create();
		expect(typeof opts.mutationFn).toBe("function");
		expect(typeof opts.onSuccess).toBe("function");

		await opts.mutationFn({ name: "Test" });
		expect(mockMutate).toHaveBeenCalledWith({ name: "Test" });

		opts.onSuccess();
		expect(invalidateEntity).toHaveBeenCalledWith("merchants");
	});

	it("onSuccess does nothing when no invalidates specified", () => {
		const mutations = defineMutations({
			doSomething: {
				mutationFn: vi.fn(),
			},
		});

		const opts = mutations.doSomething();
		// Should not throw
		opts.onSuccess();
	});
});

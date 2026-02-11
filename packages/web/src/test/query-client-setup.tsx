// Wraps @testing-library/react render and renderHook with QueryClientProvider
// so all tests automatically have access to TanStack Query context.
// This file is loaded via vitest setupFiles AFTER api-mock-setup.ts.

import { QueryClientProvider } from "@tanstack/react-query";
import type * as React from "react";
import { afterEach, vi } from "vitest";
import { queryClient } from "@/lib/api";

// Clear query cache between tests
afterEach(() => {
	queryClient.clear();
});

function AllProviders({ children }: { children: React.ReactNode }) {
	return (
		<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
	);
}

function composeWrapper(
	userWrapper: React.ComponentType<{ children: React.ReactNode }> | undefined,
) {
	if (!userWrapper) return AllProviders;
	const UserWrapper = userWrapper;
	return ({ children }: { children: React.ReactNode }) => (
		<AllProviders>
			<UserWrapper>{children}</UserWrapper>
		</AllProviders>
	);
}

vi.mock("@testing-library/react", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@testing-library/react")>();

	return {
		...actual,
		renderHook: (
			callback: (...args: unknown[]) => unknown,
			options?: Record<string, unknown>,
		) =>
			actual.renderHook(callback, {
				...options,
				wrapper: composeWrapper(
					options?.wrapper as
						| React.ComponentType<{ children: React.ReactNode }>
						| undefined,
				),
			}),
		render: (ui: React.ReactElement, options?: Record<string, unknown>) =>
			actual.render(ui, {
				...options,
				wrapper: composeWrapper(
					options?.wrapper as
						| React.ComponentType<{ children: React.ReactNode }>
						| undefined,
				),
			}),
	};
});

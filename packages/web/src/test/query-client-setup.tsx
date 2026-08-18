// Wraps @testing-library/react's render and renderHook with a QueryClientProvider
// so every test has TanStack Query context without repeating boilerplate. Loaded
// via vitest `setupFiles` after `setup.ts`.
//
// Salvaged from the pre-rework web (the one reusable piece of the old test
// infra); repointed at the new `@/lib/query-client` singleton and the dead
// IndexedDB api-mock dependency dropped.

import { QueryClientProvider } from "@tanstack/react-query";
import type * as React from "react";
import { afterEach, vi } from "vitest";
import { queryClient } from "@/lib/query-client";

// Clear the query cache between tests so cached reads don't leak across cases.
afterEach(() => {
  queryClient.clear();
});

function AllProviders({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
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
  const actual = await importOriginal<typeof import("@testing-library/react")>();

  return {
    ...actual,
    renderHook: (callback: (...args: unknown[]) => unknown, options?: Record<string, unknown>) =>
      actual.renderHook(callback, {
        ...options,
        wrapper: composeWrapper(
          options?.wrapper as React.ComponentType<{ children: React.ReactNode }> | undefined,
        ),
      }),
    render: (ui: React.ReactElement, options?: Record<string, unknown>) =>
      actual.render(ui, {
        ...options,
        wrapper: composeWrapper(
          options?.wrapper as React.ComponentType<{ children: React.ReactNode }> | undefined,
        ),
      }),
  };
});

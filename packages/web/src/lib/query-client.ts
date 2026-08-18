import { QueryClient } from "@tanstack/react-query";

/**
 * Build a `QueryClient` with the app's defaults.
 *
 * This is a local single-user app whose data only changes on the user's own
 * writes, so aggressive background refetching is unwanted:
 * - `staleTime` 30s — reads stay fresh for half a minute before re-fetch.
 * - `retry` 1 — one retry on failure, then surface the error.
 * - `refetchOnWindowFocus` false — never refetch just because the tab regained
 *   focus.
 *
 * Mutations own their own invalidation (the SDK stays invalidation-agnostic).
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });
}

/**
 * The shared app-wide client. A single instance so the app and the test harness
 * (`test/query-client-setup.tsx`) operate on the same cache.
 */
export const queryClient = createQueryClient();

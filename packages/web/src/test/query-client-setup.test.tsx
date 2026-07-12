import { useQuery } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

/**
 * Proves the salvaged `query-client-setup.tsx` harness works: the patched
 * `render` auto-wraps in a `QueryClientProvider`, so a component that calls a
 * TanStack Query hook renders without a "No QueryClient set" error.
 */
function Probe() {
	const { data } = useQuery({
		queryKey: ["probe"],
		queryFn: () => "ok",
	});
	return <div>result: {data ?? "loading"}</div>;
}

describe("query-client-setup", () => {
	it("provides a QueryClient to rendered components", async () => {
		render(<Probe />);
		expect(await screen.findByText("result: ok")).toBeInTheDocument();
	});
});

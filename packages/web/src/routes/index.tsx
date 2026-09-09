import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Index route — the app opens on the transactions view, so `/` redirects there
 * before rendering (PRD: "open on the transactions view").
 */
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/transactions" });
  },
});

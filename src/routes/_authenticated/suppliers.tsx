import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/suppliers")({
  beforeLoad: () => { throw redirect({ to: "/parties" }); },
});
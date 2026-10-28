import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { CheckCircle2, XCircle, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getConfirmInfo, submitConfirmation } from "@/lib/courier.functions";

export const Route = createFileRoute("/confirm/$token")({
  head: () => ({ meta: [
    { title: "Confirm your order — HB POS" },
    { name: "description", content: "Confirm or cancel your order before it is shipped." },
    { property: "og:title", content: "Confirm your order" },
    { property: "og:description", content: "Confirm or cancel your order before it is shipped." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex" },
  ] }),
  component: ConfirmPage,
});

function ConfirmPage() {
  const { token } = Route.useParams();
  const get = useServerFn(getConfirmInfo);
  const submit = useServerFn(submitConfirmation);
  const q = useQuery({ queryKey: ["confirm", token], queryFn: () => get({ data: { token } }), retry: false });
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const info = q.data;
  const state = done ?? info?.confirmation;

  async function decide(decision: "confirmed" | "cancelled") {
    setBusy(true);
    try { const r = await submit({ data: { token, decision } }); setDone(r.confirmation); } finally { setBusy(false); }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
        {q.isLoading ? <p className="text-center text-muted-foreground">Loading…</p> : !info ? (
          <p className="text-center text-muted-foreground">This confirmation link is not valid.</p>
        ) : (
          <>
            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-xl bg-primary/15 p-3"><Package className="size-6 text-primary" /></div>
              <div><div className="text-sm text-muted-foreground">{info.business}</div><h1 className="text-xl font-bold">Order {info.doc}</h1></div>
            </div>
            <p className="mb-3">Hi {info.firstName}, please confirm your order.</p>
            <div className="mb-4 space-y-1 rounded-xl bg-muted p-3 text-sm">
              <div className="whitespace-pre-line">{info.items}</div>
              <div>Delivery city: <b>{info.city}</b></div>
              <div className="text-base">Amount to pay on delivery: <b>Rs {info.cod.toLocaleString("en-PK")}</b></div>
            </div>
            {state === "confirmed" ? (
              <div className="flex items-center gap-2 rounded-xl bg-primary/10 p-3 font-medium"><CheckCircle2 className="size-5 text-primary" /> Thank you! Your order is confirmed and will be shipped soon.</div>
            ) : state === "cancelled" ? (
              <div className="flex items-center gap-2 rounded-xl bg-destructive/10 p-3 font-medium text-destructive"><XCircle className="size-5" /> Your order has been cancelled.</div>
            ) : state === "pending" ? (
              <div className="grid grid-cols-2 gap-3">
                <Button size="lg" disabled={busy} onClick={() => void decide("confirmed")}><CheckCircle2 className="size-4" /> Confirm</Button>
                <Button size="lg" variant="outline" disabled={busy} onClick={() => void decide("cancelled")}><XCircle className="size-4" /> Cancel</Button>
              </div>
            ) : <p className="text-muted-foreground">This order no longer needs confirmation.</p>}
          </>
        )}
      </div>
    </div>
  );
}

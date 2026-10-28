import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, Loader2, LogIn } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { storedOfflineUser } from "@/lib/offline-sync";
import { toast } from "sonner";
import logo from "@/assets/logo.webp";
import { GoogleButton } from "@/components/google-button";
import { AuthShowcase } from "@/components/auth-showcase";
import { useQuery } from "@tanstack/react-query";
import { plansQuery, formatPlanPrice } from "@/components/plans-manager";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Check, Crown } from "lucide-react";

function PlansHeader() {
  const plans = useQuery(plansQuery);
  const [open, setOpen] = useState(false);
  const list = (plans.data ?? []).filter((p) => p.is_active);
  return (
    <header className="relative z-10 flex items-center gap-3 border-b border-border bg-card/80 px-4 py-2.5 backdrop-blur-xl sm:px-6">
      <img src={logo} alt="HB POS" width={32} height={32} className="size-8 rounded-lg" />
      <span className="font-display font-bold">HB POS</span>
      <div className="ml-auto flex min-w-0 items-center gap-2">
        <div className="hidden min-w-0 items-center gap-2 overflow-x-auto md:flex">
          {list.slice(0, 4).map((p) => (
            <button key={p.id} type="button" onClick={() => setOpen(true)} className={`shrink-0 rounded-full border px-3 py-1 text-xs ${p.highlight ? "border-gold bg-gold/15 text-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}>
              <span className="font-semibold">{p.name}</span> · {formatPlanPrice(p)}
            </button>
          ))}
        </div>
        {list.length ? (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)} className="gap-1.5"><Crown className="size-4" /> Plans</Button>
        ) : null}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Subscription plans</DialogTitle>
            <DialogDescription>Choose the plan that fits your business.</DialogDescription>
          </DialogHeader>
          <div className="grid max-h-[70dvh] gap-3 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
            {list.map((p) => (
              <div key={p.id} className={`rounded-2xl border p-4 ${p.highlight ? "border-gold shadow-[var(--shadow-elegant)]" : "border-border"}`}>
                {p.highlight ? <span className="mb-2 inline-block rounded-full bg-gold/20 px-2 py-0.5 text-[10px] font-semibold uppercase">Popular</span> : null}
                <h3 className="font-display text-lg font-bold">{p.name}</h3>
                <p className="mt-1 font-display text-2xl font-bold text-primary">{formatPlanPrice(p)}</p>
                <ul className="mt-3 grid gap-1.5 text-sm">
                  {p.features.split("\n").map((f) => f.trim()).filter(Boolean).map((f) => (
                    <li key={f} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-primary" />{f}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </header>
  );
}

function safeNext(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (!value.startsWith("/") || value.startsWith("//")) return undefined;
  return value;
}

export const Route = createFileRoute("/auth")({
  // Auth state sirf browser me hoti hai — SSR karne se hydration mismatch hota tha.
  ssr: false,
  // Desktop (offline) app me login nahi hota — seedha workspace khulta hai.
  beforeLoad: () => {
    if (import.meta.env.VITE_OFFLINE === "1") throw redirect({ to: "/" });
  },
  validateSearch: (s: Record<string, unknown>): { next?: string } => {
    const next = safeNext(s["next"]);
    return next ? { next } : {};
  },
  head: () => ({
    meta: [
      { title: "Sign In — HBPOS" },
      {
        name: "description",
        content:
          "HBPOS staff sign in — access to orders, invoices, extraction and live rates.",
      },
      { property: "og:title", content: "Sign In — HBPOS" },
      { property: "og:description", content: "Staff sign in for HBPOS workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

type Mode = "signin" | "signup" | "forgot";

function AuthPage() {
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const goNext = () => {
    if (next) window.location.href = next;
    else navigate({ to: "/", replace: true });
  };
  const [mode, setMode] = useState<Mode>("signin");
  const [usePhone, setUsePhone] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  // Server Suspense fallback render karta hai, client pehli dafa component —
  // is mismatch se hydration fail hoti thi aur page reload maangta tha.
  // Pehla client render bhi khaali rakhte hain, mount ke baad asli page.
  const [mounted, setMounted] = useState(false);
  const pendingRef = useRef(false);
  const busyRef = useRef(false);

  useEffect(() => {
    setMounted(true);
    if (!navigator.onLine && storedOfflineUser()) { navigate({ to: "/pos", replace: true }); return; }
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) goNext();
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        // wait for approval check before entering the app
        setTimeout(() => { if (!pendingRef.current && !busyRef.current) goNext(); }, 0);
      }
    });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, next]);

  if (!mounted) return null;
  const mv: string = "b";

  // Phone number ko ek internal email ID mein badalte hain taake bina SMS
  // service ke phone se signup/signin ho sake (phone hi login ID hai).
  const resolveEmail = (): string => {
    if (!usePhone) return email.trim();
    let digits = email.replace(/\D/g, "");
    if (digits.startsWith("0")) digits = "92" + digits.slice(1);
    if (!digits.startsWith("92")) digits = "92" + digits;
    if (digits.length < 11) throw new Error("Enter a valid mobile number (e.g. 03001234567)");
    return `p${digits}@phone.hbchemicalspakistan.com`;
  };

  // Mobile signups wait for owner approval before they can sign in.
  const isPending = async (): Promise<boolean> => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return false;
    const { data: req } = await (supabase as any)
      .from("signup_requests")
      .select("approved_at")
      .eq("user_id", u.user.id)
      .maybeSingle();
    if (req && !req.approved_at) {
      pendingRef.current = true;
      await supabase.auth.signOut();
      setSent("Signup under verification");
      toast.info("Signup under verification");
      return true;
    }
    return false;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    busyRef.current = true;
    pendingRef.current = false;
    setSent(null);
    try {
      const loginEmail = resolveEmail();
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password });
        if (error) throw error;
        if (await isPending()) return;
        toast.success("Welcome back");
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: loginEmail,
          password,
          options: {
            emailRedirectTo: next ? window.location.origin + next : window.location.origin,
            data: { full_name: fullName },
          },
        });
        if (error) throw error;
        if (!data.session && usePhone) {
          const { error: signErr } = await supabase.auth.signInWithPassword({ email: loginEmail, password });
          if (!signErr) {
            await isPending();
            return;
          }
        }
        if (!data.session) {
          setSent(
            usePhone
              ? "Account created — you can now sign in with your mobile number."
              : "Account created — check your email for the confirmation link.",
          );
          toast.success("Account created");
        }
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setSent("A password reset link has been sent to your email.");
        toast.success("Reset link sent");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      busyRef.current = false;
      setBusy(false);
      if (!pendingRef.current) {
        const { data: s2 } = await supabase.auth.getSession();
        if (s2.session) goNext();
      }
    }
  };

  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden bg-background">
      <PlansHeader />
      <div className="relative grid flex-1 lg:grid-cols-[1.35fr_1fr]">
      <div aria-hidden className="pointer-events-none absolute inset-0 auth-mesh" />
      <section className="relative hidden lg:block">
        <AuthShowcase />
      </section>

      <div className={`relative flex flex-col lg:flex-row justify-end lg:justify-center lg:items-center lg:px-4 lg:py-10 ${mv === "b" ? "items-end" : "items-start"} ${mv === "b" ? "" : "px-4 pb-6"}`}>
      {mv === "b" ? <div className="relative h-[44dvh] min-h-64 w-full shrink-0 lg:hidden"><AuthShowcase compact /></div> : null}
      <div className={`relative w-full max-w-md auth-rise ${mv === "b" ? "max-lg:-mt-6 max-lg:mx-auto" : ""}`}>
        {mv === "a" ? (
          <div className="relative -mx-4 mb-4 h-56 overflow-hidden rounded-b-3xl lg:hidden"><AuthShowcase compact /></div>
        ) : null}
        {mv === "c" ? (
          <div className="mb-4 flex gap-2 overflow-x-auto py-4 lg:hidden">
            {["Fast billing", "Multi-store stock", "40+ reports", "Works offline"].map((t) => (
              <span key={t} className="shrink-0 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground"><span className="mr-1.5 inline-block size-1.5 rounded-full bg-gold" />{t}</span>
            ))}
          </div>
        ) : null}
        <div className={`mb-6 flex-col items-center gap-3 text-center ${mv === "c" ? "flex" : "hidden lg:flex"}`}>
          <div className="relative">
            <div aria-hidden className="absolute -inset-3 rounded-3xl bg-[image:var(--gradient-brand)] opacity-25 blur-xl" />
            <img src={logo} alt="HB POS" width={80} height={80} className="relative size-20 rounded-2xl border border-border bg-card p-2 shadow-[var(--shadow-elegant)]" />
          </div>
          <div>
            <h2 className="font-display text-2xl font-bold text-foreground">Welcome to HB POS</h2>
            <p className="text-sm text-muted-foreground">Smart POS & business management</p>
          </div>
        </div>

        <div className={`border border-border bg-card/85 p-5 shadow-[var(--shadow-elegant)] backdrop-blur-xl sm:p-7 ${mv === "b" ? "max-lg:rounded-b-none max-lg:rounded-t-3xl max-lg:border-b-0 max-lg:bg-card rounded-3xl" : "rounded-3xl"}`} >
          <h2 className="font-display text-lg font-bold text-foreground">
            {mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Forgot password"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "forgot"
              ? "Enter your email — a reset link will be sent there."
              : "Access your workspace with your account."}
          </p>

          <form onSubmit={submit} className="mt-5 grid gap-4">
            {mode === "signup" ? (
              <div className="grid gap-1.5">
                <Label htmlFor="name">Full name</Label>
                <Input
                  id="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your name"
                  autoComplete="name"
                  className="h-11"
                />
              </div>
            ) : null}

            {mode !== "forgot" ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setUsePhone(false); setEmail(""); }}
                  className={`h-9 flex-1 rounded-lg border text-sm font-medium ${!usePhone ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
                >
                  Email
                </button>
                <button
                  type="button"
                  onClick={() => { setUsePhone(true); setEmail(""); }}
                  className={`h-9 flex-1 rounded-lg border text-sm font-medium ${usePhone ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
                >
                  Mobile number
                </button>
              </div>
            ) : null}

            <div className="grid gap-1.5">
              <Label htmlFor="email">{usePhone ? "Mobile number" : "Email"}</Label>
              <Input
                id="email"
                type={usePhone ? "tel" : "email"}
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={usePhone ? "03001234567" : "you@company.com"}
                autoComplete={usePhone ? "tel" : "email"}
                className="h-11"
              />
              {usePhone ? (
                <p className="text-xs text-muted-foreground">
                  No OTP needed — your mobile number is your login ID. Remember the password you set.
                </p>
              ) : null}
            </div>

            {mode !== "forgot" ? (
              <div className="grid gap-1.5">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    className="h-11 pr-11"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>
            ) : null}

            {sent ? (
              <p className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground">
                {sent}
              </p>
            ) : null}

            <Button type="submit" disabled={busy} className="h-11 gap-2">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <LogIn className="size-4" />}
              {mode === "signin" ? "Sign in" : mode === "signup" ? "Sign up" : "Send reset link"}
            </Button>
          </form>

          {mode !== "forgot" ? (
            <>
              <div className="my-4 flex items-center gap-3">
                <span className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">or</span>
                <span className="h-px flex-1 bg-border" />
              </div>
              <GoogleButton disabled={busy} next={next} />
            </>
          ) : null}

          <div className="mt-5 grid gap-2 text-center text-sm">
            {mode === "signin" ? (
              <>
                <button
                  type="button"
                  onClick={() => { setMode("forgot"); setSent(null); }}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  Forgot password?
                </button>
                <p className="text-muted-foreground">
                  Don't have an account?{" "}
                  <button type="button" onClick={() => { setMode("signup"); setSent(null); }} className="text-primary underline-offset-4 hover:underline">
                    Sign up
                  </button>
                </p>
              </>
            ) : (
              <p className="text-muted-foreground">
                Already have an account?{" "}
                <button type="button" onClick={() => { setMode("signin"); setSent(null); }} className="text-primary underline-offset-4 hover:underline">
                  Sign in
                </button>
              </p>
            )}
          </div>
        </div>
        <p className={`text-center text-xs text-muted-foreground ${mv === "b" ? "bg-card pb-4 pt-2 lg:bg-transparent lg:mt-6" : "mt-6"}`}>© HB Chemicals Pakistan</p>
      </div>
      </div>
      </div>
    </main>
  );
}

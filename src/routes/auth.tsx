import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, Loader2, LogIn } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import logo from "@/assets/logo.webp";
import { GoogleButton } from "@/components/google-button";

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
      { title: "Sign In — OrderBot | HB Chemicals Pakistan" },
      {
        name: "description",
        content:
          "HB Chemicals OrderBot staff sign in — access to orders, invoices, extraction and live rates.",
      },
      { property: "og:title", content: "Sign In — OrderBot | HB Chemicals Pakistan" },
      { property: "og:description", content: "Staff sign in for OrderBot workspace." },
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

  useEffect(() => {
    setMounted(true);
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) goNext();
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) goNext();
    });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, next]);

  if (!mounted) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setSent(null);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back");
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: next ? window.location.origin + next : window.location.origin,
            data: { full_name: fullName },
          },
        });
        if (error) throw error;
        if (!data.session) {
          setSent("Account created — check your email for the confirmation link.");
          toast.success("Confirmation email sent");
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
      setBusy(false);
    }
  };

  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <img src={logo} alt="HB Chemicals Pakistan" width={48} height={48} className="h-12 w-auto" />
          <div>
            <h1 className="font-display text-xl font-bold text-foreground">HB Chemicals Pakistan</h1>
            <p className="text-sm text-muted-foreground">Staff workspace</p>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
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

            <div className="grid gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                autoComplete="email"
                className="h-11"
              />
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
      </div>
    </main>
  );
}

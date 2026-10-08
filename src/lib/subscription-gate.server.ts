/** Returns a 403 Response when the caller's workspace subscription is inactive, else null. */
export async function subscriptionBlock(request: Request): Promise<Response | null> {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return null; // auth itself is handled by each route
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const res = await fetch(`${process.env["SUPABASE_URL"]}/rest/v1/rpc/my_subscription`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: "{}",
    });
    if (!res.ok) return null;
    const d = (await res.json()) as { active?: boolean } | null;
    if (d && d.active === false) {
      return new Response("Subscription inactive — your account is view-only. Please contact the admin to activate it.", { status: 403 });
    }
    return null;
  } catch {
    return null;
  }
}

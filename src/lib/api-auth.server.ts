/** Bearer token se signed-in user verify karta hai; invalid/absent par null. */
export async function requireUserId(request: Request): Promise<string | null> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  try {
    const { createPublicSupabase } = await import("@/lib/product-sync.server");
    const { data, error } = await createPublicSupabase().auth.getUser(token);
    if (error || !data.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

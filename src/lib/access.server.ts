/** Returns true when the signed-in user is not blocked by an admin. */
export async function isActiveProfile(
  supabase: {
    from: (table: "profiles") => {
      select: (cols: "is_active") => {
        eq: (col: "id", value: string) => {
          maybeSingle: () => PromiseLike<{ data: { is_active: boolean } | null }>;
        };
      };
    };
  },
  userId: string,
) {
  const { data } = await supabase.from("profiles").select("is_active").eq("id", userId).maybeSingle();
  return data?.is_active !== false;
}

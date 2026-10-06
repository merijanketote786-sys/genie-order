import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PosUnit = { id: string; name: string; short_name: string | null; parent_id: string | null; factor: number };
export type PosCategory = { id: string; name: string };

export function usePosUnits() {
  return useQuery({
    queryKey: ["pos-units"],
    staleTime: 60_000,
    queryFn: async (): Promise<PosUnit[]> => {
      const { data, error } = await supabase.from("pos_units").select("id,name,short_name,parent_id,factor").order("name");
      if (error) throw error;
      return (data ?? []).map((u) => ({ ...u, factor: Number(u.factor) }));
    },
  });
}

export function usePosCategories() {
  return useQuery({
    queryKey: ["pos-categories"],
    staleTime: 60_000,
    queryFn: async (): Promise<PosCategory[]> => {
      const { data, error } = await supabase.from("pos_categories").select("id,name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCatalogRefresh() {
  const qc = useQueryClient();
  return () => { qc.invalidateQueries({ queryKey: ["pos-units"] }); qc.invalidateQueries({ queryKey: ["pos-categories"] }); };
}

const fail = (e: { message: string; code?: string } | null) => {
  if (!e) return;
  if (e.code === "23505") throw new Error("This name already exists");
  if (e.code === "42501") throw new Error("You do not have permission to change this");
  throw new Error(e.message);
};

export const catalog = {
  addUnit: async (u: { name: string; parent_id?: string | null; factor?: number }) => fail((await supabase.from("pos_units").insert({ name: u.name.trim(), parent_id: u.parent_id ?? null, factor: u.factor ?? 1 } as never)).error),
  updateUnit: async (id: string, p: Partial<Pick<PosUnit, "name" | "parent_id" | "factor">>) => fail((await supabase.from("pos_units").update(p).eq("id", id)).error),
  deleteUnit: async (id: string) => fail((await supabase.from("pos_units").delete().eq("id", id)).error),
  addCategory: async (name: string) => fail((await supabase.from("pos_categories").insert({ name: name.trim() } as never)).error),
  updateCategory: async (id: string, name: string) => fail((await supabase.from("pos_categories").update({ name: name.trim() }).eq("id", id)).error),
  deleteCategory: async (id: string) => fail((await supabase.from("pos_categories").delete().eq("id", id)).error),
};

/** Number formatting for conversion factors */
export const fmtFactor = (n: number) => (Number.isFinite(n) ? Number(n.toPrecision(10)).toString() : "0");

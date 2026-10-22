import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizePhone } from "@/lib/record-parse";
import { z } from "zod";

export const editPosPartyDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    customerId: z.string().uuid().optional(),
    supplierId: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(120),
    phone: z.string().trim().max(30),
    address: z.string().trim().max(300),
    city: z.string().trim().max(80).optional(),
    email: z.string().trim().max(160).optional(),
    courier: z.string().trim().max(120).optional(),
    adda: z.string().trim().max(120).optional(),
    creditLimit: z.number().min(0).max(1e9).nullable().optional(),
  }).refine((d) => Boolean(d.customerId || d.supplierId)).parse(input))
  .handler(async ({ data, context }) => {
    const phone = data.phone ? normalizePhone(data.phone) : "";
    if (data.phone && !phone) throw new Error("Enter a valid phone number");
    // Generated RPC types omit nullable arguments; SQL accepts NULL for either side.
    const { error } = await (context.supabase as any).rpc("pos_edit_party_details", {
      _customer: data.customerId ?? null,
      _supplier: data.supplierId ?? null,
      _details: {
        name: data.name, phone: phone ?? "", address: data.address,
        ...(data.customerId ? { city: data.city ?? "", email: data.email ?? "", courier: data.courier ?? "", adda: data.adda ?? "", creditLimit: data.creditLimit == null ? "" : String(data.creditLimit) } : {}),
      },
    });
    if (error?.code === "23505") throw new Error("This phone number belongs to another party. Use a different number.");
    if (error) throw new Error("Could not save party details");
    return { name: data.name, phone: phone ?? "", address: data.address, city: data.city ?? "" };
  });

export const getPosPartyDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ customerId: z.string().uuid().optional(), supplierId: z.string().uuid().optional() }).parse(input))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const c = data.customerId ? (await sb.from("customers").select("name, phone, address, city, email, courier_service_name, goods_adda_name, credit_limit").eq("id", data.customerId).maybeSingle()).data : null;
    const s = !c && data.supplierId ? (await sb.from("suppliers").select("name, phone, address").eq("id", data.supplierId).maybeSingle()).data : null;
    const r = c ?? s ?? {};
    return {
      name: String(r.name ?? ""), phone: String(r.phone ?? ""), address: String(r.address ?? ""), city: String(c?.city ?? ""), email: String(c?.email ?? ""),
      courier: String(c?.courier_service_name ?? ""), adda: String(c?.goods_adda_name ?? ""), creditLimit: c?.credit_limit == null ? "" : String(c.credit_limit),
    };
  });
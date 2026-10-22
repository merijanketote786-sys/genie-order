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
  }).refine((d) => Boolean(d.customerId || d.supplierId)).parse(input))
  .handler(async ({ data, context }) => {
    const phone = data.phone ? normalizePhone(data.phone) : "";
    if (data.phone && !phone) throw new Error("Enter a valid phone number");
    const { error } = await context.supabase.rpc("pos_edit_party_details", {
      _customer: data.customerId ?? null,
      _supplier: data.supplierId ?? null,
      _details: { name: data.name, phone: phone ?? "", address: data.address },
    });
    if (error?.code === "23505") throw new Error("This phone number belongs to another party. Use a different number.");
    if (error) throw new Error("Could not save party details");
    return { name: data.name, phone: phone ?? "", address: data.address };
  });
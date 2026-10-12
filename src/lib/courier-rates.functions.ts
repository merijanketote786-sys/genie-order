import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { normalizeConfig, type CourierProfile } from "@/lib/courier-rates";

async function blocked(context: { supabase: unknown; userId: string }) {
  const { isActiveProfile } = await import("@/lib/access.server");
  return !(await isActiveProfile(context.supabase as never, context.userId));
}

async function workspaceOf(userId: string): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("workspace_id")
    .eq("id", userId)
    .maybeSingle();
  return data?.workspace_id ?? userId;
}

/** HB workspace ko built-in PostEx rules milte hain, baaqi sab apni rate sheet upload karte hain. */
export const getCalculatorMode = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getOwnerWorkspaceId } = await import("@/lib/product-sync.server");
    const [ws, owner] = await Promise.all([workspaceOf(context.userId), getOwnerWorkspaceId()]);
    return { builtin: !!owner && ws === owner };
  });

export const listCouriers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (await blocked(context)) return { couriers: [] as CourierProfile[] };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("courier_profiles")
      .select("id, name, config, source_file, updated_at")
      .eq("workspace_id", await workspaceOf(context.userId))
      .order("name", { ascending: true })
      .limit(50);

    const couriers: CourierProfile[] = [];
    for (const r of (data ?? []) as Record<string, unknown>[]) {
      const config = normalizeConfig(r["config"]);
      if (!config) continue;
      couriers.push({
        id: String(r["id"]),
        name: String(r["name"]),
        sourceFile: r["source_file"] ? String(r["source_file"]) : null,
        config,
        updatedAt: String(r["updated_at"]),
      });
    }
    return { couriers };
  });

/**
 * Fixed-format courier sheet parser (no AI).
 * Rows: Service, Zone, Upto Kg, Rate   (Zone: within city / same province / cross province / all)
 * Extra rows: "Additional Kg Rate, 50" · "Fuel %, 15" · "Tax %, 18" · "COD %, 4" · "Material, Flyer, 15"
 */
function parseCourierSheet(text: string) {
  const num = (v?: string) => Number(String(v ?? "").replace(/[^\d.]/g, ""));
  const zoneOf = (z: string): string[] | null => {
    const t = z.toLowerCase();
    if (/all|any|every/.test(t)) return ["within_city", "same_province", "cross_province"];
    if (/within|same\s*city|local|city/.test(t)) return ["within_city"];
    if (/same\s*prov|province\s*same|zone/.test(t)) return ["same_province"];
    if (/cross|other|national|overland|inter/.test(t)) return ["cross_province"];
    return null;
  };
  const services: { id: string; label: string }[] = [];
  const slabs: { serviceId: string; zoneId: string; uptoKg: number; rate: number }[] = [];
  const materials: { id: string; label: string; rate: number }[] = [];
  let additionalKgRate = 0, fuelPct = 0, taxPct = 0, codPct = 0;
  for (const raw of text.split(/\r?\n/)) {
    const cells = raw.split(/\t|,/).map((c) => c.trim().replace(/^"|"$/g, ""));
    const head = (cells[0] ?? "").toLowerCase();
    if (!head || head.startsWith("###") || head === "service") continue;
    if (/additional|extra\s*kg/.test(head)) { additionalKgRate = num(cells[1]); continue; }
    if (/fuel/.test(head)) { fuelPct = num(cells[1]); continue; }
    if (/tax|gst/.test(head)) { taxPct = num(cells[1]); continue; }
    if (/^cod/.test(head)) { codPct = num(cells[1]); continue; }
    if (/material|packing/.test(head)) {
      const label = cells[1] ?? "";
      if (label && num(cells[2]) >= 0) materials.push({ id: label.toLowerCase().replace(/[^a-z0-9]+/g, "_"), label, rate: num(cells[2]) });
      continue;
    }
    const zones = zoneOf(cells[1] ?? "");
    const upto = num(cells[2]);
    const rate = num(cells[3]);
    if (!zones || !(upto > 0) || !(rate > 0)) continue;
    const label = cells[0]!;
    const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "_") || "standard";
    if (!services.some((s) => s.id === id)) services.push({ id, label });
    for (const zoneId of zones) slabs.push({ serviceId: id, zoneId, uptoKg: upto, rate });
  }
  if (!slabs.length) return null;
  return { services, slabs, additionalKgRate, fuelPct, taxPct, codPct, materials };
}

export const importCourierDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        fileName: z.string().min(1).max(260),
        fileType: z.string().max(200).default(""),
        dataUrl: z.string().min(1).max(14_000_000),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    if (await blocked(context)) {
      return { ok: false as const, message: "Your access is blocked. Contact the admin." };
    }

    const ext = (data.fileName.split(".").pop() ?? "").toLowerCase();
    const allowed = ["xlsx", "xls", "csv", "txt", "docx"];
    if (!allowed.includes(ext)) {
      return {
        ok: false as const,
        message: `".${ext}" files are not supported. Upload Word (.docx), Excel (.xlsx/.xls), CSV or TXT.`,
      };
    }

    const base64 = data.dataUrl.includes(",") ? data.dataUrl.split(",")[1]! : data.dataUrl;
    let bytes: Uint8Array;
    try {
      const bin = atob(base64);
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    } catch {
      return { ok: false as const, message: "Could not read the file. Please upload it again." };
    }
    if (bytes.length > 10 * 1024 * 1024) {
      return { ok: false as const, message: "File 10MB se bari hai." };
    }

    let extracted = "";
    try {
      if (["xlsx", "xls", "csv"].includes(ext)) {
        const { sheetToText } = await import("@/lib/courier-doc.server");
        extracted = sheetToText(bytes);
      } else if (ext === "docx") {
        const { docxToText } = await import("@/lib/courier-doc.server");
        extracted = await docxToText(bytes);
      } else if (ext === "txt") {
        extracted = new TextDecoder().decode(bytes).slice(0, 60_000);
      }
    } catch {
      return {
        ok: false as const,
        message: "Could not read the file's data — it may be corrupted or password-protected.",
      };
    }
    if (["xlsx", "xls", "csv", "docx", "txt"].includes(ext) && extracted.trim().length < 10) {
      return { ok: false as const, message: "The file appears empty — no rate table found." };
    }

    if (!extracted.trim()) {
      return { ok: false as const, message: "Upload an Excel, CSV, Word or TXT rate sheet in the given format." };
    }
    const parsed = parseCourierSheet(extracted);
    if (!parsed) {
      return { ok: false as const, message: "No courier rate rows found. Use columns: Service, Zone, Upto Kg, Rate." };
    }

    const config = normalizeConfig(parsed);
    if (!config) {
      return {
        ok: false as const,
        message: "The rate sheet is missing weight slabs or rates — please check the file and re-upload.",
      };
    }
    return { ok: true as const, config, fileName: data.fileName };
  });

const configSchema = z.object({
  services: z.array(z.object({ id: z.string().min(1), label: z.string().min(1) })).min(1),
  slabs: z
    .array(
      z.object({
        serviceId: z.string().min(1),
        zoneId: z.enum(["within_city", "same_province", "cross_province"]),
        uptoKg: z.number().finite().positive(),
        rate: z.number().finite().positive(),
      }),
    )
    .min(1)
    .max(400),
  additionalKgRate: z.number().finite().min(0),
  fuelPct: z.number().finite().min(0),
  taxPct: z.number().finite().min(0),
  codPct: z.number().finite().min(0),
  materials: z
    .array(z.object({ id: z.string().min(1), label: z.string().min(1), rate: z.number().finite().min(0) }))
    .max(30),
  notes: z.array(z.string()).max(10).optional(),
});

export const saveCourier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        name: z.string().trim().min(2).max(80),
        sourceFile: z.string().max(260).nullable().default(null),
        // client percent (0-100) bhejta hai, engine fraction rakhta hai — yahan fraction hi aata hai
        config: configSchema,
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    if (await blocked(context)) {
      return { ok: false as const, message: "Your access is blocked. Contact the admin." };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const workspaceId = await workspaceOf(context.userId);

    const { data: existing } = await supabaseAdmin
      .from("courier_profiles")
      .select("id")
      .eq("workspace_id", workspaceId)
      .ilike("name", data.name)
      .maybeSingle();

    const row = {
      workspace_id: workspaceId,
      name: data.name,
      config: data.config,
      source_file: data.sourceFile,
      created_by: context.userId,
    };

    const { error } = existing?.id
      ? await supabaseAdmin
          .from("courier_profiles")
          .update({ config: row.config, source_file: row.source_file })
          .eq("id", existing.id)
      : await supabaseAdmin.from("courier_profiles").insert(row);

    if (error) return { ok: false as const, message: "Failed to save the courier." };
    return { ok: true as const, message: `${data.name} saved successfully` };
  });

export const deleteCourier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    if (await blocked(context)) {
      return { ok: false as const, message: "Aapka access band hai." };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("courier_profiles")
      .delete()
      .eq("id", data.id)
      .eq("workspace_id", await workspaceOf(context.userId));
    if (error) return { ok: false as const, message: "Failed to delete." };
    return { ok: true as const, message: "Courier hata diya" };
  });

import { normalizeConfig, type CourierProfile } from "@/lib/courier-rates";
import { commit, db, now, uid } from "./store";

type Arg<T> = { data: T } | undefined;

/** Offline app HB ke built-in PostEx rules ke sath chalti hai. */
export async function getCalculatorMode() {
  return { builtin: true };
}

export async function listCouriers() {
  const couriers: CourierProfile[] = [];
  for (const r of db().couriers) {
    const config = normalizeConfig(r.config);
    if (!config) continue;
    couriers.push({
      id: r.id,
      name: r.name,
      sourceFile: r.source_file,
      config,
      updatedAt: r.updated_at,
    });
  }
  return { couriers };
}

export async function importCourierDocument() {
  return {
    ok: false as const,
    message: "Courier rate sheet padhne ke liye internet chahiye. Offline me built-in calculator use karein.",
  };
}

export async function saveCourier(arg: Arg<{ id?: string | null; name: string; config: unknown; fileName?: string | null }>) {
  const data = arg!.data;
  const config = normalizeConfig(data.config);
  if (!config) return { ok: false as const, message: "Courier config theek nahi." };
  const d = db();
  const existing = data.id ? d.couriers.find((c) => c.id === data.id) : undefined;
  if (existing) {
    existing.name = data.name;
    existing.config = config;
    existing.source_file = data.fileName ?? existing.source_file;
    existing.updated_at = now();
  } else {
    d.couriers.push({
      id: uid(),
      name: data.name,
      source_file: data.fileName ?? null,
      config,
      updated_at: now(),
    });
  }
  commit();
  return { ok: true as const, message: `${data.name} save ho gaya` };
}

export async function deleteCourier(arg: Arg<{ id: string }>) {
  const d = db();
  d.couriers = d.couriers.filter((c) => c.id !== arg!.data.id);
  commit();
  return { ok: true as const, message: "Courier delete ho gaya" };
}

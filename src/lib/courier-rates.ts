/**
 * Custom courier rate sheets (non-HB workspaces).
 * Har user apni courier ki rate list upload karta hai; hisaab isi generic engine se hota hai.
 */
import type { ZoneId } from "@/lib/postex";

export type CourierZoneId = ZoneId;

export interface CourierService {
  id: string;
  label: string;
}

export interface CourierSlab {
  serviceId: string;
  zoneId: CourierZoneId;
  /** Slab ki upper weight limit (kg). */
  uptoKg: number;
  rate: number;
}

export interface CourierMaterial {
  id: string;
  label: string;
  rate: number;
}

export interface CourierConfig {
  services: CourierService[];
  slabs: CourierSlab[];
  additionalKgRate: number;
  fuelPct: number;
  taxPct: number;
  codPct: number;
  materials: CourierMaterial[];
  notes?: string[];
}

export interface CourierProfile {
  id: string;
  name: string;
  sourceFile: string | null;
  config: CourierConfig;
  updatedAt: string;
}

export interface CourierCalculation {
  base: number;
  baseLabel: string;
  additionalKg: number;
  additionalCharge: number;
  freight: number;
  fuel: number;
  tax: number;
  codFee: number;
  codAmount: number;
  materialLines: Array<{ item: CourierMaterial; qty: number; amount: number }>;
  materialsTotal: number;
  total: number;
}

export const MAX_WEIGHT_KG = 100;

/** Config ko sanitize karta hai — galat/khali data par null. */
export function normalizeConfig(raw: unknown): CourierConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const n = (v: unknown, fallback = 0) => {
    const x = Number(v);
    return Number.isFinite(x) && x >= 0 ? x : fallback;
  };

  const services: CourierService[] = Array.isArray(o["services"])
    ? (o["services"] as unknown[])
        .map((s, i) => {
          const r = (s ?? {}) as Record<string, unknown>;
          const id = String(r["id"] ?? `service_${i + 1}`).trim() || `service_${i + 1}`;
          return { id, label: String(r["label"] ?? id).trim() || id };
        })
        .slice(0, 12)
    : [];

  const zoneIds: CourierZoneId[] = ["within_city", "same_province", "cross_province"];
  const slabs: CourierSlab[] = Array.isArray(o["slabs"])
    ? (o["slabs"] as unknown[])
        .map((s) => {
          const r = (s ?? {}) as Record<string, unknown>;
          const zoneId = String(r["zoneId"] ?? "") as CourierZoneId;
          return {
            serviceId: String(r["serviceId"] ?? "").trim(),
            zoneId,
            uptoKg: n(r["uptoKg"]),
            rate: n(r["rate"]),
          };
        })
        .filter((s) => s.serviceId && zoneIds.includes(s.zoneId) && s.uptoKg > 0 && s.rate > 0)
        .slice(0, 400)
    : [];

  if (!services.length || !slabs.length) return null;
  const known = new Set(services.map((s) => s.id));
  const usable = slabs.filter((s) => known.has(s.serviceId));
  if (!usable.length) return null;

  const materials: CourierMaterial[] = Array.isArray(o["materials"])
    ? (o["materials"] as unknown[])
        .map((m, i) => {
          const r = (m ?? {}) as Record<string, unknown>;
          const label = String(r["label"] ?? "").trim();
          return { id: String(r["id"] ?? `material_${i + 1}`), label, rate: n(r["rate"]) };
        })
        .filter((m) => m.label && m.rate > 0)
        .slice(0, 30)
    : [];

  const pct = (v: unknown) => Math.min(100, n(v)) / 100;

  return {
    services: services.filter((s) => usable.some((u) => u.serviceId === s.id)),
    slabs: usable,
    additionalKgRate: n(o["additionalKgRate"]),
    fuelPct: pct(o["fuelPct"]),
    taxPct: pct(o["taxPct"]),
    codPct: pct(o["codPct"]),
    materials,
    notes: Array.isArray(o["notes"])
      ? (o["notes"] as unknown[]).map((x) => String(x)).slice(0, 10)
      : [],
  };
}

export function zonesInConfig(config: CourierConfig, serviceId: string): CourierZoneId[] {
  const set = new Set<CourierZoneId>();
  for (const s of config.slabs) if (s.serviceId === serviceId) set.add(s.zoneId);
  return [...set];
}

export function calculateCourier(params: {
  config: CourierConfig;
  weightKg: number;
  zoneId: CourierZoneId;
  serviceId: string;
  codEnabled: boolean;
  codAmount: number;
  codRate?: number;
  materialQty: Record<string, number>;
}): CourierCalculation | null {
  const { config, weightKg, zoneId, serviceId, codEnabled, codAmount, materialQty } = params;
  if (!(weightKg > 0) || weightKg > MAX_WEIGHT_KG) return null;

  const slabs = config.slabs
    .filter((s) => s.serviceId === serviceId && s.zoneId === zoneId)
    .sort((a, b) => a.uptoKg - b.uptoKg);
  if (!slabs.length) return null;

  const fit = slabs.find((s) => weightKg <= s.uptoKg);
  const last = slabs[slabs.length - 1]!;
  const slab = fit ?? last;
  const additionalKg = fit ? 0 : Math.ceil(weightKg - last.uptoKg);
  const additionalCharge = additionalKg * config.additionalKgRate;
  const freight = slab.rate + additionalCharge;

  const fuel = freight * config.fuelPct;
  const tax = (freight + fuel) * config.taxPct;
  const codRate = params.codRate ?? config.codPct;
  const codFee = codEnabled && codAmount > 0 ? codAmount * codRate : 0;

  const materialLines = config.materials
    .map((item) => {
      const qty = materialQty[item.id] ?? 0;
      return { item, qty, amount: qty * item.rate };
    })
    .filter((l) => l.qty > 0);
  const materialsTotal = materialLines.reduce((s, l) => s + l.amount, 0);

  return {
    base: slab.rate,
    baseLabel: `Up to ${slab.uptoKg} kg`,
    additionalKg,
    additionalCharge,
    freight,
    fuel,
    tax,
    codFee,
    codAmount: codEnabled ? codAmount : 0,
    materialLines,
    materialsTotal,
    total: freight + fuel + tax + codFee + materialsTotal,
  };
}

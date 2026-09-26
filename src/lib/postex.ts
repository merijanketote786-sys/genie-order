export type ZoneId = "within_city" | "same_province" | "cross_province";
export type ServiceId = "standard" | "overland";

export interface Zone {
  id: ZoneId;
  label: string;
  description: string;
}

export interface Service {
  id: ServiceId;
  label: string;
  description: string;
}

export const ZONES: Zone[] = [
  { id: "within_city", label: "Within City", description: "Pickup & delivery inside the same city" },
  { id: "same_province", label: "Same Province", description: "Between cities of the same province" },
  { id: "cross_province", label: "Province to Province", description: "Across provinces / nationwide" },
];

export const SERVICES: Service[] = [
  { id: "standard", label: "Standard Delivery", description: "Slabs up to 1 kg, then Rs 65 per extra kg" },
  { id: "overland", label: "Overland Service", description: "Flat up to 5 kg, then Rs 65 per extra kg" },
];

/** Standard: 0–0.5 kg and 0.5–1 kg base rates per zone. */
export const STANDARD_RATES: Record<ZoneId, { upToHalf: number; upToOne: number }> = {
  within_city: { upToHalf: 85, upToOne: 95 },
  same_province: { upToHalf: 150, upToOne: 160 },
  cross_province: { upToHalf: 160, upToOne: 170 },
};

/** Overland: flat rate up to 5 kg per zone. */
export const OVERLAND_RATES: Record<ZoneId, number> = {
  within_city: 200,
  same_province: 250,
  cross_province: 250,
};

/** Extra kg charged after the base slab (Standard after 1 kg, Overland after 5 kg). */
export const ADDITIONAL_KG_RATE = 65;
/** Overland uses the same extra-kg rate as Standard. */
export const OVERLAND_ADDITIONAL_KG_RATE = ADDITIONAL_KG_RATE;
export const MAX_WEIGHT_KG = 100;
export const FUEL_SURCHARGE_RATE = 0.15;
export const TAX_RATE = 0.18;
/** Not specified in the PostEx rate chart — configurable assumption. */
export const COD_FEE_RATE = 0.04;

/** Weight above this (kg) automatically switches the service to Overland. */
export const AUTO_SERVICE_THRESHOLD_KG = 2;

/** > 2 kg → Overland; 2 kg or less → Standard. */
export function autoServiceForWeight(weightKg: number): ServiceId {
  return weightKg > AUTO_SERVICE_THRESHOLD_KG ? "overland" : "standard";
}

export interface MaterialItem {
  id: string;
  label: string;
  rate: number;
}

export const MATERIALS: MaterialItem[] = [
  { id: "small_flyer", label: 'Small Flyer (10x12")', rate: 15 },
  { id: "medium_flyer", label: 'Medium Flyer (12x16")', rate: 22 },
  { id: "large_flyer", label: 'Large Flyer (14x19")', rate: 25 },
  { id: "fragile_sticker", label: "Fragile Sticker", rate: 3 },
];

export interface FreightBreakdown {
  base: number;
  baseLabel: string;
  additionalKg: number;
  additionalCharge: number;
  freight: number;
}

export function computeFreight(
  weightKg: number,
  zoneId: ZoneId,
  serviceId: ServiceId,
): FreightBreakdown | null {
  if (!(weightKg > 0) || weightKg > MAX_WEIGHT_KG) return null;

  if (serviceId === "overland") {
    const base = OVERLAND_RATES[zoneId];
    const additionalKg = weightKg > 5 ? Math.ceil(weightKg - 5) : 0;
    const additionalCharge = additionalKg * OVERLAND_ADDITIONAL_KG_RATE;
    return {
      base,
      baseLabel: "Up to 5 kg",
      additionalKg,
      additionalCharge,
      freight: base + additionalCharge,
    };
  }

  const r = STANDARD_RATES[zoneId];
  if (weightKg <= 0.5) {
    return { base: r.upToHalf, baseLabel: "0 – 0.5 kg", additionalKg: 0, additionalCharge: 0, freight: r.upToHalf };
  }
  const base = r.upToOne;
  const additionalKg = weightKg > 1 ? Math.ceil(weightKg - 1) : 0;
  const additionalCharge = additionalKg * ADDITIONAL_KG_RATE;
  return {
    base,
    baseLabel: "0.5 – 1 kg",
    additionalKg,
    additionalCharge,
    freight: base + additionalCharge,
  };
}

export interface MaterialLine {
  item: MaterialItem;
  qty: number;
  amount: number;
}

export interface Calculation extends FreightBreakdown {
  zone: Zone;
  service: Service;
  fuel: number;
  tax: number;
  codFee: number;
  codAmount: number;
  materialLines: MaterialLine[];
  materialsTotal: number;
  total: number;
}

export function calculate(params: {
  weightKg: number;
  zoneId: ZoneId;
  serviceId: ServiceId;
  codAmount: number;
  codEnabled: boolean;
  codRate?: number;
  materialQty: Record<string, number>;
}): Calculation | null {
  const { weightKg, zoneId, serviceId, codAmount, codEnabled, materialQty } = params;
  const codRate = params.codRate ?? COD_FEE_RATE;
  const f = computeFreight(weightKg, zoneId, serviceId);
  if (!f) return null;

  const zone = ZONES.find((z) => z.id === zoneId)!;
  const service = SERVICES.find((s) => s.id === serviceId)!;
  const fuel = f.freight * FUEL_SURCHARGE_RATE;
  const tax = (f.freight + fuel) * TAX_RATE;
  const codFee = codEnabled && codAmount > 0 ? codAmount * codRate : 0;

  const materialLines: MaterialLine[] = MATERIALS.map((item) => {
    const qty = materialQty[item.id] ?? 0;
    return { item, qty, amount: qty * item.rate };
  }).filter((l) => l.qty > 0);
  const materialsTotal = materialLines.reduce((s, l) => s + l.amount, 0);

  return {
    ...f,
    zone,
    service,
    fuel,
    tax,
    codFee,
    codAmount: codEnabled ? codAmount : 0,
    materialLines,
    materialsTotal,
    total: f.freight + fuel + tax + codFee + materialsTotal,
  };
}

export function formatPKR(amount: number): string {
  return `Rs ${amount.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Compact courier rate calculator — Order/Invoice pages ke andar inline.
 * Poora calculator /calculator par hai; yahan sirf zaroori fields hain.
 */
import { CitySelect } from "@/components/city-select";
import { CITIES, detectZone, type City } from "@/lib/postex-cities";
import { getCalculatorMode, listCouriers } from "@/lib/courier-rates.functions";
import { calculateCourier, type CourierProfile } from "@/lib/courier-rates";
import {
  MAX_WEIGHT_KG,
  ZONES,
  autoServiceForWeight,
  calculate,
  formatPKR,
  type ZoneId,
} from "@/lib/postex";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Calculator, ChevronDown, Copy, CornerDownLeft } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type Props = {
  /** Calculated delivery charge ko composer me daalne ke liye. */
  onUse?: (amount: number) => void;
  useLabel?: string;
};

const fieldClass =
  "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/30";

export function RateMiniCalculator({ onUse, useLabel = "Use" }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <section className="rounded-2xl border border-border bg-card shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left sm:px-4"
      >
        <Calculator className="size-4 shrink-0 text-primary" />
        <span className="text-sm font-semibold text-foreground">Courier rate calculator</span>
        <span className="hidden truncate text-xs text-muted-foreground sm:inline">
          · weight + city se delivery charges
        </span>
        <ChevronDown
          className={`ml-auto size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? <MiniBody onUse={onUse} useLabel={useLabel} /> : null}
    </section>
  );
}

function MiniBody({ onUse, useLabel }: Props & { useLabel: string }) {
  const loadMode = useServerFn(getCalculatorMode);
  const loadCouriers = useServerFn(listCouriers);

  const { data: mode } = useQuery({
    queryKey: ["calculator-mode"],
    queryFn: () => loadMode(),
    staleTime: 10 * 60_000,
    retry: 0,
  });
  const builtin = mode?.builtin ?? false;

  const { data: courierData } = useQuery({
    queryKey: ["couriers"],
    queryFn: () => loadCouriers(),
    enabled: mode ? !builtin : false,
    staleTime: 5 * 60_000,
    retry: 0,
  });
  const couriers: CourierProfile[] = courierData?.couriers ?? [];

  const [courierId, setCourierId] = useState("");
  const courier = couriers.find((c) => c.id === courierId) ?? couriers[0] ?? null;

  const [weightInput, setWeightInput] = useState("");
  const [origin, setOrigin] = useState<City | null>(
    CITIES.find((c) => c.n === "Lahore" && c.p === "Punjab") ?? null,
  );
  const [destination, setDestination] = useState<City | null>(null);
  const [zoneOverride, setZoneOverride] = useState<ZoneId | "">("");

  const detectedZone: ZoneId | null =
    origin && destination ? (detectZone(origin, destination) as ZoneId) : null;
  const zone: ZoneId = (zoneOverride || detectedZone || "within_city") as ZoneId;

  const weight = parseFloat(weightInput);
  const weightError =
    weightInput.trim() === ""
      ? null
      : Number.isNaN(weight) || weight <= 0
        ? "Weight 0 se zyada hona chahiye."
        : weight > MAX_WEIGHT_KG
          ? `Max ${MAX_WEIGHT_KG} kg.`
          : null;

  const result = useMemo(() => {
    if (weightError || !(weight > 0)) return null;
    if (builtin) {
      const r = calculate({
        weightKg: weight,
        zoneId: zone,
        serviceId: autoServiceForWeight(weight),
        codAmount: 0,
        codEnabled: false,
        materialQty: {},
      });
      return r ? { total: r.total, label: `${r.service.label} · ${r.baseLabel}` } : null;
    }
    if (!courier) return null;
    const serviceId = courier.config.services[0]?.id ?? "";
    const r = calculateCourier({
      config: courier.config,
      weightKg: weight,
      zoneId: zone,
      serviceId,
      codEnabled: false,
      codAmount: 0,
      materialQty: {},
    });
    return r ? { total: r.total, label: `${courier.name} · ${r.baseLabel}` } : null;
  }, [builtin, courier, weight, weightError, zone]);

  const rounded = result ? Math.round(result.total) : 0;

  return (
    <div className="border-t border-border px-3 py-3 sm:px-4">
      {!builtin && couriers.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Pehle Calculator page par apni courier rate sheet upload karein.
        </p>
      ) : (
        <>
          {!builtin && couriers.length > 1 ? (
            <select
              aria-label="Courier"
              value={courier?.id ?? ""}
              onChange={(e) => setCourierId(e.target.value)}
              className={`${fieldClass} mb-2`}
            >
              {couriers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          ) : null}

          <div className="grid gap-2 sm:grid-cols-4">
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.1"
              placeholder="Weight (kg)"
              aria-label="Parcel weight in kg"
              value={weightInput}
              onChange={(e) => setWeightInput(e.target.value)}
              className={fieldClass}
            />
            <CitySelect
              id="mini-origin"
              label="Pickup"
              placeholder="Pickup city"
              value={origin}
              onChange={(c) => {
                setOrigin(c);
                setZoneOverride("");
              }}
              compact
            />
            <CitySelect
              id="mini-destination"
              label="Delivery"
              placeholder="Delivery city"
              value={destination}
              onChange={(c) => {
                setDestination(c);
                setZoneOverride("");
              }}
              compact
            />
            <select
              aria-label="Delivery zone"
              value={zoneOverride || zone}
              onChange={(e) => setZoneOverride(e.target.value as ZoneId)}
              className={fieldClass}
            >
              {ZONES.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.label}
                </option>
              ))}
            </select>
          </div>

          {weightError ? (
            <p className="mt-2 text-xs font-medium text-destructive">{weightError}</p>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="min-w-0">
              <p className="font-display text-base font-bold tabular-nums text-foreground">
                {result ? formatPKR(result.total) : "—"}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {result ? result.label : "Weight aur city daalein"}
              </p>
            </div>
            <div className="ml-auto flex shrink-0 gap-2">
              <button
                type="button"
                disabled={!result}
                onClick={() => {
                  void navigator.clipboard.writeText(String(rounded));
                  toast.success("Copy ho gaya");
                }}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-input px-3 text-xs font-semibold text-foreground transition hover:bg-muted disabled:opacity-50"
              >
                <Copy className="size-3.5" /> Copy
              </button>
              {onUse ? (
                <button
                  type="button"
                  disabled={!result}
                  onClick={() => onUse(rounded)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
                >
                  <CornerDownLeft className="size-3.5" /> {useLabel}
                </button>
              ) : null}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

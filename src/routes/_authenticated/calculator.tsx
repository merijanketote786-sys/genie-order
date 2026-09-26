import { AppShell } from "@/components/app-shell";
import { WorkspaceHeader } from "@/components/workspace-header";
import { CitySelect } from "@/components/city-select";
import { CITIES, detectZone, type City } from "@/lib/postex-cities";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CustomCourierCalculator } from "@/components/custom-courier-calculator";
import { getCalculatorMode } from "@/lib/courier-rates.functions";
import {
  Boxes,
  Calculator as CalculatorIcon,
  Fuel,
  Info,
  Landmark,
  PackageCheck,
  Scale,
  Truck,
  Wallet,
} from "lucide-react";
import {
  ADDITIONAL_KG_RATE,
  AUTO_SERVICE_THRESHOLD_KG,
  COD_FEE_RATE,
  FUEL_SURCHARGE_RATE,
  MATERIALS,
  MAX_WEIGHT_KG,
  SERVICES,
  TAX_RATE,
  ZONES,
  autoServiceForWeight,
  calculate,
  formatPKR,
  type ServiceId,
  type ZoneId,
} from "@/lib/postex";

export const Route = createFileRoute("/_authenticated/calculator")({
  head: () => ({
    meta: [
      { title: "Courier Rate Calculator — HB Chemicals OrderBot" },
      {
        name: "description",
        content:
          "PostEx shipping charges calculator: weight slabs, pickup and delivery city zone detection, fuel surcharge, tax, packaging materials and COD fee.",
      },
      { property: "og:title", content: "Courier Rate Calculator — HB Chemicals OrderBot" },
      {
        property: "og:description",
        content:
          "Full charges breakdown with parcel weight, zone, service type, packaging and COD fee.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CalculatorPage,
});

function CalculatorPage() {
  const loadMode = useServerFn(getCalculatorMode);
  const { data, isLoading } = useQuery({
    queryKey: ["calculator-mode"],
    queryFn: () => loadMode(),
    staleTime: 10 * 60_000,
    retry: 0,
  });
  const builtin = data?.builtin ?? false;

  return (
    <AppShell
      title="Courier Rate Calculator"
      subtitle="Full breakdown of parcel charges"
      active="/calculator"
    >
      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        <WorkspaceHeader
          icon={CalculatorIcon}
          eyebrow="Logistics"
          title="Courier Rate Calculator"
          description="Detects the zone from weight, pickup and delivery city to give an itemized total of freight, fuel, tax, packaging and COD fee."
          meta={builtin ? ["PostEx rates", "Standard", "Overland"] : ["Your own rate sheet", "Multi courier"]}
        />
        {isLoading ? (
          <p className="mt-6 text-sm text-muted-foreground">Loading…</p>
        ) : builtin ? (
          <BuiltinCalculator />
        ) : (
          <CustomCourierCalculator />
        )}
      </div>
    </AppShell>
  );
}

function BuiltinCalculator() {
  const [weightInput, setWeightInput] = useState("");
  const [service, setService] = useState<ServiceId>("standard");
  const [origin, setOrigin] = useState<City | null>(
    CITIES.find((c) => c.n === "Lahore" && c.p === "Punjab") ?? null,
  );
  const [destination, setDestination] = useState<City | null>(null);
  const [zoneOverride, setZoneOverride] = useState<ZoneId | null>(null);
  const [codEnabled, setCodEnabled] = useState(false);
  const [codInput, setCodInput] = useState("");
  const [codRateInput, setCodRateInput] = useState(String(COD_FEE_RATE * 100));
  const [materialQty, setMaterialQty] = useState<Record<string, number>>({});
  const [touched, setTouched] = useState(false);

  const detectedZone: ZoneId | null =
    origin && destination ? (detectZone(origin, destination) as ZoneId) : null;
  const zone: ZoneId = zoneOverride ?? detectedZone ?? "within_city";

  useEffect(() => {
    setZoneOverride(null);
  }, [origin, destination]);

  const weight = parseFloat(weightInput);
  const cod = parseFloat(codInput);
  const codRatePct = parseFloat(codRateInput);

  // Auto-select service from weight: > 2 kg → Overland, else Standard.
  useEffect(() => {
    if (!Number.isNaN(weight) && weight > 0) {
      setService(autoServiceForWeight(weight));
    }
  }, [weight]);

  const weightError = useMemo(() => {
    if (weightInput.trim() === "") return "Enter the parcel weight to calculate.";
    if (Number.isNaN(weight) || weight <= 0) return "Weight must be a number greater than 0 kg.";
    if (weight > MAX_WEIGHT_KG) return `Maximum supported weight is ${MAX_WEIGHT_KG} kg per parcel.`;
    return null;
  }, [weightInput, weight]);

  const codError = useMemo(() => {
    if (!codEnabled) return null;
    if (codInput.trim() === "") return "Enter the COD amount to collect, or turn COD off.";
    if (Number.isNaN(cod) || cod < 0) return "COD amount must be 0 or more.";
    if (Number.isNaN(codRatePct) || codRatePct < 0 || codRatePct > 100)
      return "COD fee percentage must be between 0 and 100.";
    return null;
  }, [codEnabled, codInput, cod, codRatePct]);

  const result =
    !weightError && !codError
      ? calculate({
          weightKg: weight,
          zoneId: zone,
          serviceId: service,
          codAmount: Number.isNaN(cod) ? 0 : cod,
          codEnabled,
          codRate: Number.isNaN(codRatePct) ? 0 : codRatePct / 100,
          materialQty,
        })
      : null;

  const setQty = (id: string, value: number) =>
    setMaterialQty((prev) => ({ ...prev, [id]: Math.max(0, Math.min(999, value || 0)) }));

  const inputClass =
    "mt-2 h-12 w-full rounded-xl border border-input bg-background px-4 text-base text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/30";

  return (
    <>
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
          <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
            {/* Service */}
            <fieldset>
              <legend className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Truck className="h-4 w-4 text-primary" /> Service type
              </legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {SERVICES.map((s) => (
                  <label
                    key={s.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition ${
                      service === s.id
                        ? "border-primary bg-accent"
                        : "border-input bg-background hover:border-ring"
                    }`}
                  >
                    <input
                      type="radio"
                      name="service"
                      value={s.id}
                      checked={service === s.id}
                      onChange={() => setService(s.id)}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--primary)]"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-foreground">{s.label}</span>
                      <span className="block text-xs text-muted-foreground">{s.description}</span>
                    </span>
                  </label>
                ))}
              </div>
              <p className="mt-2 flex gap-1.5 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Auto-selected by weight: parcels above {AUTO_SERVICE_THRESHOLD_KG} kg use{" "}
                  <strong>Overland Service</strong>, {AUTO_SERVICE_THRESHOLD_KG} kg or less use{" "}
                  <strong>Standard Delivery</strong>. You can still override manually.
                </span>
              </p>
            </fieldset>

            {/* Weight */}
            <div className="mt-6">
              <label
                htmlFor="weight"
                className="flex items-center gap-2 text-sm font-semibold text-foreground"
              >
                <Scale className="h-4 w-4 text-primary" /> Parcel weight (kg)
              </label>
              <input
                id="weight"
                inputMode="decimal"
                type="number"
                min="0"
                step="0.1"
                placeholder="e.g. 2.5"
                value={weightInput}
                onChange={(e) => setWeightInput(e.target.value)}
                onBlur={() => setTouched(true)}
                className={inputClass}
                aria-invalid={touched && !!weightError}
              />
              {touched && weightError ? (
                <p className="mt-2 text-sm font-medium text-destructive">{weightError}</p>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">
                  Every started extra kg is charged Rs {ADDITIONAL_KG_RATE} (after{" "}
                  {service === "overland" ? "5 kg" : "1 kg"}).
                </p>
              )}
            </div>

            {/* Cities */}
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <CitySelect
                id="origin"
                label="Pickup city"
                placeholder="e.g. Karachi"
                value={origin}
                onChange={setOrigin}
              />
              <CitySelect
                id="destination"
                label="Delivery city"
                placeholder="e.g. Lahore"
                value={destination}
                onChange={setDestination}
              />
            </div>
            {origin && destination ? (
              <p className="mt-2 flex gap-1.5 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Detected zone: <strong>{ZONES.find((z) => z.id === detectedZone)?.label}</strong> (
                  {origin.n} → {destination.n})
                </span>
              </p>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                Search any PostEx-supported city — the delivery zone is detected automatically.
              </p>
            )}

            {/* Zone */}
            <fieldset className="mt-6">
              <legend className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Truck className="h-4 w-4 text-primary" /> Delivery zone
                {detectedZone && (
                  <span className="text-xs font-normal text-muted-foreground">
                    auto-detected · you can override
                  </span>
                )}
              </legend>
              <div className="mt-2 grid gap-2">
                {ZONES.map((z) => (
                  <label
                    key={z.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition ${
                      zone === z.id
                        ? "border-primary bg-accent"
                        : "border-input bg-background hover:border-ring"
                    }`}
                  >
                    <input
                      type="radio"
                      name="zone"
                      value={z.id}
                      checked={zone === z.id}
                      onChange={() => setZoneOverride(z.id)}
                      className="h-4 w-4 shrink-0 accent-[var(--primary)]"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-foreground">
                        {z.label}
                      </span>
                      <span className="block text-xs text-muted-foreground">{z.description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            {/* Packaging materials */}
            <fieldset className="mt-6">
              <legend className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Boxes className="h-4 w-4 text-primary" /> Packaging materials{" "}
                <span className="text-xs font-normal text-muted-foreground">optional</span>
              </legend>
              <div className="mt-2 grid gap-2">
                {MATERIALS.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-input bg-background px-4 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{m.label}</p>
                      <p className="text-xs text-muted-foreground">Rs {m.rate} each</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        aria-label={`Decrease ${m.label}`}
                        onClick={() => setQty(m.id, (materialQty[m.id] ?? 0) - 1)}
                        className="h-9 w-9 rounded-lg border border-input text-base font-bold text-foreground transition hover:bg-muted"
                      >
                        −
                      </button>
                      <input
                        type="number"
                        min="0"
                        inputMode="numeric"
                        aria-label={`${m.label} quantity`}
                        value={materialQty[m.id] ?? 0}
                        onChange={(e) => setQty(m.id, parseInt(e.target.value, 10))}
                        className="h-9 w-14 rounded-lg border border-input bg-background text-center text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
                      />
                      <button
                        type="button"
                        aria-label={`Increase ${m.label}`}
                        onClick={() => setQty(m.id, (materialQty[m.id] ?? 0) + 1)}
                        className="h-9 w-9 rounded-lg border border-input text-base font-bold text-foreground transition hover:bg-muted"
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                XL Flyer (18x21&quot;) is excluded — no rate is listed in the rate chart.
              </p>
            </fieldset>

            {/* COD */}
            <div className="mt-6">
              <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold text-foreground">
                <input
                  type="checkbox"
                  checked={codEnabled}
                  onChange={(e) => setCodEnabled(e.target.checked)}
                  className="h-4 w-4 accent-[var(--primary)]"
                />
                <Wallet className="h-4 w-4 text-primary" /> Cash on Delivery
              </label>

              {codEnabled && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="cod" className="text-xs font-semibold text-muted-foreground">
                      COD amount (PKR)
                    </label>
                    <input
                      id="cod"
                      inputMode="numeric"
                      type="number"
                      min="0"
                      step="1"
                      placeholder="0"
                      value={codInput}
                      onChange={(e) => setCodInput(e.target.value)}
                      onBlur={() => setTouched(true)}
                      className={inputClass}
                      aria-invalid={touched && !!codError}
                    />
                  </div>
                  <div>
                    <label htmlFor="codRate" className="text-xs font-semibold text-muted-foreground">
                      COD fee (%)
                    </label>
                    <input
                      id="codRate"
                      inputMode="decimal"
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={codRateInput}
                      onChange={(e) => setCodRateInput(e.target.value)}
                      onBlur={() => setTouched(true)}
                      className={inputClass}
                    />
                  </div>
                </div>
              )}

              {touched && codError ? (
                <p className="mt-2 text-sm font-medium text-destructive">{codError}</p>
              ) : (
                <p className="mt-2 flex gap-1.5 text-xs text-muted-foreground">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    Assumed {COD_FEE_RATE * 100}% COD fee — this is <strong>not specified</strong> in
                    the PostEx rate chart and is configurable.
                  </span>
                </p>
              )}
            </div>
          </section>

          {/* Result */}
          <section
            aria-live="polite"
            className="h-fit rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6"
          >
            <h2 className="font-display text-lg font-bold tracking-tight text-foreground">
              Charges breakdown
            </h2>

            {result ? (
              <div className="mt-4">
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">
                    <Truck className="h-3.5 w-3.5" />
                    {result.service.label}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">
                    <PackageCheck className="h-3.5 w-3.5" />
                    Slab: {result.baseLabel}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">
                    {result.zone.label}
                  </span>
                </div>

                <dl className="mt-5 space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-muted-foreground">Base freight ({result.baseLabel})</dt>
                    <dd className="font-semibold tabular-nums text-foreground">
                      {formatPKR(result.base)}
                    </dd>
                  </div>
                  {result.additionalKg > 0 && (
                    <div className="flex items-center justify-between gap-4">
                      <dt className="text-muted-foreground">
                        Additional weight ({result.additionalKg} kg × Rs {ADDITIONAL_KG_RATE})
                      </dt>
                      <dd className="font-semibold tabular-nums text-foreground">
                        {formatPKR(result.additionalCharge)}
                      </dd>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-4 border-t border-border pt-3">
                    <dt className="font-semibold text-foreground">Freight subtotal</dt>
                    <dd className="font-semibold tabular-nums text-foreground">
                      {formatPKR(result.freight)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <dt className="flex items-center gap-1.5 text-muted-foreground">
                      <Fuel className="h-3.5 w-3.5" />
                      Fuel surcharge ({FUEL_SURCHARGE_RATE * 100}%)
                    </dt>
                    <dd className="font-semibold tabular-nums text-foreground">
                      {formatPKR(result.fuel)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <dt className="flex items-center gap-1.5 text-muted-foreground">
                      <Landmark className="h-3.5 w-3.5" />
                      Tax ({TAX_RATE * 100}% on freight + fuel)
                    </dt>
                    <dd className="font-semibold tabular-nums text-foreground">
                      {formatPKR(result.tax)}
                    </dd>
                  </div>
                  {result.materialLines.map((l) => (
                    <div key={l.item.id} className="flex items-center justify-between gap-4">
                      <dt className="flex items-center gap-1.5 text-muted-foreground">
                        <Boxes className="h-3.5 w-3.5" />
                        {l.item.label} × {l.qty}
                      </dt>
                      <dd className="font-semibold tabular-nums text-foreground">
                        {formatPKR(l.amount)}
                      </dd>
                    </div>
                  ))}
                  {result.codFee > 0 && (
                    <div className="flex items-center justify-between gap-4">
                      <dt className="flex items-center gap-1.5 text-muted-foreground">
                        <Wallet className="h-3.5 w-3.5" />
                        COD fee ({codRatePct}% of {formatPKR(result.codAmount)})
                      </dt>
                      <dd className="font-semibold tabular-nums text-foreground">
                        {formatPKR(result.codFee)}
                      </dd>
                    </div>
                  )}
                </dl>

                <div
                  className="mt-6 rounded-xl p-5 text-primary-foreground"
                  style={{ backgroundImage: "var(--gradient-brand)" }}
                >
                  <p className="text-xs font-medium uppercase tracking-wider opacity-80">
                    Total charges
                  </p>
                  <p className="mt-1 font-display text-3xl font-black tabular-nums tracking-tight">
                    {formatPKR(result.total)}
                  </p>
                  {result.codAmount > 0 && (
                    <p className="mt-2 text-xs opacity-80">
                      Amount to collect from customer: {formatPKR(result.codAmount)}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-6 grid place-items-center rounded-xl border border-dashed border-input bg-muted/50 px-6 py-12 text-center">
                <PackageCheck className="h-10 w-10 text-muted-foreground/50" />
                <p className="mt-3 text-sm font-medium text-muted-foreground">
                  Enter a valid parcel weight to see the itemized total.
                </p>
              </div>
            )}
          </section>
      </div>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Rates per HB Chemicals PostEx chart, exclusive of {TAX_RATE * 100}% tax;{" "}
        {FUEL_SURCHARGE_RATE * 100}% fuel surcharge applied on freight. COD fee is an assumed,
        configurable rate.
      </p>
    </>
  );
}

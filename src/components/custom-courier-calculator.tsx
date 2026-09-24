import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Boxes,
  Fuel,
  Info,
  Landmark,
  Loader2,
  PackageCheck,
  Scale,
  Trash2,
  Truck,
  Upload,
  Wallet,
} from "lucide-react";
import { CitySelect } from "@/components/city-select";
import { CITIES, detectZone, type City } from "@/lib/postex-cities";
import { ZONES, formatPKR, type ZoneId } from "@/lib/postex";
import {
  MAX_WEIGHT_KG,
  calculateCourier,
  zonesInConfig,
  type CourierConfig,
  type CourierProfile,
} from "@/lib/courier-rates";
import {
  deleteCourier,
  importCourierDocument,
  listCouriers,
  saveCourier,
} from "@/lib/courier-rates.functions";

const inputClass =
  "mt-2 h-12 w-full rounded-xl border border-input bg-background px-4 text-base text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/30";

const ACCEPT = ".pdf,.docx,.xlsx,.xls,.csv,.txt,.png,.jpg,.jpeg,.webp";

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

export function CustomCourierCalculator() {
  const qc = useQueryClient();
  const load = useServerFn(listCouriers);
  const importDoc = useServerFn(importCourierDocument);
  const save = useServerFn(saveCourier);
  const remove = useServerFn(deleteCourier);

  const { data, isLoading } = useQuery({
    queryKey: ["couriers"],
    queryFn: () => load(),
    staleTime: 60_000,
    retry: 0,
  });
  const couriers: CourierProfile[] = data?.couriers ?? [];

  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    if (!selectedId && couriers.length) setSelectedId(couriers[0]!.id);
  }, [couriers, selectedId]);
  const selected = couriers.find((c) => c.id === selectedId) ?? null;

  /* ---------------- upload ---------------- */
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ config: CourierConfig; fileName: string } | null>(null);
  const [courierName, setCourierName] = useState("");

  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const dataUrl = await fileToDataUrl(file);
      return importDoc({ data: { fileName: file.name, fileType: file.type, dataUrl } });
    },
    onSuccess: (res, file) => {
      if (!res.ok) {
        setError(res.message);
        setPreview(null);
        return;
      }
      setError(null);
      setPreview({ config: res.config as CourierConfig, fileName: res.fileName });
      setCourierName((n) => n || file.name.replace(/\.[^.]+$/, "").slice(0, 60));
    },
    onError: () => setError("File upload failed. Please try again."),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!preview) throw new Error("no preview");
      return save({
        data: { name: courierName.trim(), sourceFile: preview.fileName, config: preview.config },
      });
    },
    onSuccess: async (res) => {
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setPreview(null);
      setCourierName("");
      setError(null);
      await qc.invalidateQueries({ queryKey: ["couriers"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: async () => {
      setSelectedId(null);
      await qc.invalidateQueries({ queryKey: ["couriers"] });
    },
  });

  const pickFile = (file: File | null | undefined) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError("File is larger than 10MB.");
      return;
    }
    setError(null);
    importMutation.mutate(file);
  };

  /* ---------------- calculator ---------------- */
  const [weightInput, setWeightInput] = useState("");
  const [serviceId, setServiceId] = useState<string>("");
  const [origin, setOrigin] = useState<City | null>(
    CITIES.find((c) => c.n === "Lahore" && c.p === "Punjab") ?? null,
  );
  const [destination, setDestination] = useState<City | null>(null);
  const [zoneOverride, setZoneOverride] = useState<ZoneId | null>(null);
  const [codEnabled, setCodEnabled] = useState(false);
  const [codInput, setCodInput] = useState("");
  const [materialQty, setMaterialQty] = useState<Record<string, number>>({});
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (selected && !selected.config.services.some((s) => s.id === serviceId)) {
      setServiceId(selected.config.services[0]?.id ?? "");
    }
  }, [selected, serviceId]);

  useEffect(() => setZoneOverride(null), [origin, destination]);

  const detectedZone: ZoneId | null =
    origin && destination ? (detectZone(origin, destination) as ZoneId) : null;
  const available = selected ? zonesInConfig(selected.config, serviceId) : [];
  const zone: ZoneId =
    zoneOverride ?? (detectedZone && available.includes(detectedZone) ? detectedZone : available[0] ?? "within_city");

  const weight = parseFloat(weightInput);
  const cod = parseFloat(codInput);

  const weightError = useMemo(() => {
    if (weightInput.trim() === "") return "Enter the parcel weight to calculate.";
    if (Number.isNaN(weight) || weight <= 0) return "Weight must be a number greater than 0 kg.";
    if (weight > MAX_WEIGHT_KG) return `Maximum supported weight is ${MAX_WEIGHT_KG} kg per parcel.`;
    return null;
  }, [weightInput, weight]);

  const result =
    selected && !weightError
      ? calculateCourier({
          config: selected.config,
          weightKg: weight,
          zoneId: zone,
          serviceId,
          codEnabled,
          codAmount: Number.isNaN(cod) ? 0 : cod,
          materialQty,
        })
      : null;

  const setQty = (id: string, value: number) =>
    setMaterialQty((prev) => ({ ...prev, [id]: Math.max(0, Math.min(999, value || 0)) }));

  const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
        {/* Upload */}
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Upload className="h-4 w-4 text-primary" /> Upload your courier rate sheet
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            PDF, Word (.docx), Excel (.xlsx/.xls), CSV, or a picture of the rate chart — rates will be
            read automatically and applied to the calculator.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              pickFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={importMutation.isPending}
            className="mt-3 inline-flex h-11 items-center gap-2 rounded-xl border border-input bg-background px-4 text-sm font-semibold text-foreground transition hover:border-ring disabled:opacity-60"
          >
            {importMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Reading file…
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" /> Choose file
              </>
            )}
          </button>

          {error && (
            <p className="mt-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
              {error}
            </p>
          )}

          {preview && (
            <div className="mt-4 rounded-xl border border-border bg-muted/40 p-4">
              <p className="text-sm font-semibold text-foreground">
                {preview.config.slabs.length} rate slabs found ({preview.config.services.length}{" "}
                service)
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Fuel {pct(preview.config.fuelPct)} · Tax {pct(preview.config.taxPct)} · COD{" "}
                {pct(preview.config.codPct)} · Extra kg Rs {preview.config.additionalKgRate}
              </p>
              {(preview.config.notes ?? []).map((n, i) => (
                <p key={i} className="mt-1 text-xs text-muted-foreground">
                  • {n}
                </p>
              ))}
              <label className="mt-3 block text-xs font-semibold text-muted-foreground">
                Courier name
              </label>
              <input
                value={courierName}
                onChange={(e) => setCourierName(e.target.value)}
                placeholder="e.g. Leopards, TCS, M&P"
                className={inputClass}
              />
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={courierName.trim().length < 2 || saveMutation.isPending}
                  onClick={() => saveMutation.mutate()}
                  className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition disabled:opacity-60"
                >
                  {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save courier
                </button>
                <button
                  type="button"
                  onClick={() => setPreview(null)}
                  className="h-11 rounded-xl border border-input px-4 text-sm font-semibold text-foreground"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Courier select */}
        <div className="mt-6 border-t border-border pt-6">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Truck className="h-4 w-4 text-primary" /> Select courier
          </h2>
          {isLoading ? (
            <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
          ) : couriers.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              No courier saved yet. Upload your rate sheet above.
            </p>
          ) : (
            <div className="mt-2 grid gap-2">
              {couriers.map((c) => (
                <div
                  key={c.id}
                  className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 transition ${
                    selectedId === c.id ? "border-primary bg-accent" : "border-input bg-background"
                  }`}
                >
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                    <input
                      type="radio"
                      name="courier"
                      checked={selectedId === c.id}
                      onChange={() => setSelectedId(c.id)}
                      className="h-4 w-4 shrink-0 accent-[var(--primary)]"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-foreground">
                        {c.name}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {c.config.slabs.length} slabs · fuel {pct(c.config.fuelPct)} · tax{" "}
                        {pct(c.config.taxPct)}
                      </span>
                    </span>
                  </label>
                  <button
                    type="button"
                    aria-label={`Delete ${c.name}`}
                    onClick={() => deleteMutation.mutate(c.id)}
                    className="h-9 w-9 shrink-0 rounded-lg border border-input text-muted-foreground transition hover:text-destructive"
                  >
                    <Trash2 className="mx-auto h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {selected && (
          <>
            {/* Service */}
            {selected.config.services.length > 1 && (
              <fieldset className="mt-6 border-t border-border pt-6">
                <legend className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <PackageCheck className="h-4 w-4 text-primary" /> Service type
                </legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {selected.config.services.map((s) => (
                    <label
                      key={s.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition ${
                        serviceId === s.id
                          ? "border-primary bg-accent"
                          : "border-input bg-background hover:border-ring"
                      }`}
                    >
                      <input
                        type="radio"
                        name="service"
                        checked={serviceId === s.id}
                        onChange={() => setServiceId(s.id)}
                        className="h-4 w-4 shrink-0 accent-[var(--primary)]"
                      />
                      <span className="truncate text-sm font-semibold text-foreground">
                        {s.label}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

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
                  Every extra kg started after the last slab costs Rs {selected.config.additionalKgRate}.
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
                {ZONES.filter((z) => available.includes(z.id)).map((z) => (
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

            {/* Materials */}
            {selected.config.materials.length > 0 && (
              <fieldset className="mt-6">
                <legend className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Boxes className="h-4 w-4 text-primary" /> Packaging materials{" "}
                  <span className="text-xs font-normal text-muted-foreground">optional</span>
                </legend>
                <div className="mt-2 grid gap-2">
                  {selected.config.materials.map((m) => (
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
              </fieldset>
            )}

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
                <div className="mt-3">
                  <label htmlFor="cod" className="text-xs font-semibold text-muted-foreground">
                    COD amount (PKR) — fee {pct(selected.config.codPct)}
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
                    className={inputClass}
                  />
                </div>
              )}
            </div>
          </>
        )}
      </section>

      {/* Result */}
      <section
        aria-live="polite"
        className="h-fit rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6"
      >
        <h2 className="font-display text-lg font-bold tracking-tight text-foreground">
          Charges breakdown
        </h2>

        {result && selected ? (
          <div className="mt-4">
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">
                <Truck className="h-3.5 w-3.5" />
                {selected.name}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">
                <PackageCheck className="h-3.5 w-3.5" />
                Slab: {result.baseLabel}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">
                {ZONES.find((z) => z.id === zone)?.label}
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
                    Additional weight ({result.additionalKg} kg × Rs{" "}
                    {selected.config.additionalKgRate})
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
              {result.fuel > 0 && (
                <div className="flex items-center justify-between gap-4">
                  <dt className="flex items-center gap-1.5 text-muted-foreground">
                    <Fuel className="h-3.5 w-3.5" /> Fuel surcharge ({pct(selected.config.fuelPct)})
                  </dt>
                  <dd className="font-semibold tabular-nums text-foreground">
                    {formatPKR(result.fuel)}
                  </dd>
                </div>
              )}
              {result.tax > 0 && (
                <div className="flex items-center justify-between gap-4">
                  <dt className="flex items-center gap-1.5 text-muted-foreground">
                    <Landmark className="h-3.5 w-3.5" /> Tax ({pct(selected.config.taxPct)})
                  </dt>
                  <dd className="font-semibold tabular-nums text-foreground">
                    {formatPKR(result.tax)}
                  </dd>
                </div>
              )}
              {result.materialLines.map((l) => (
                <div key={l.item.id} className="flex items-center justify-between gap-4">
                  <dt className="flex items-center gap-1.5 text-muted-foreground">
                    <Boxes className="h-3.5 w-3.5" /> {l.item.label} × {l.qty}
                  </dt>
                  <dd className="font-semibold tabular-nums text-foreground">
                    {formatPKR(l.amount)}
                  </dd>
                </div>
              ))}
              {result.codFee > 0 && (
                <div className="flex items-center justify-between gap-4">
                  <dt className="flex items-center gap-1.5 text-muted-foreground">
                    <Wallet className="h-3.5 w-3.5" /> COD fee ({pct(selected.config.codPct)} of{" "}
                    {formatPKR(result.codAmount)})
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
                <p className="mt-2 text-sm opacity-90">
                  Collect from customer: {formatPKR(result.codAmount)}
                </p>
              )}
            </div>
          </div>
        ) : (
          <p className="mt-4 flex gap-2 text-sm text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {couriers.length === 0
                ? "Upload your courier rate sheet first — then enter weight and city to see charges."
                : "Select a courier and enter weight and city."}
            </span>
          </p>
        )}
      </section>
    </div>
  );
}

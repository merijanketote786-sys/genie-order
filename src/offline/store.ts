/**
 * Offline (desktop app) data store. Sab kuch localStorage me rehta hai — koi network nahi.
 * Sirf offline build (VITE_OFFLINE=1) me use hota hai; online app isay import nahi karta.
 */
import {
  DEFAULT_USER_SETTINGS,
  DEFAULT_WORKSPACE_SETTINGS,
  type UserSettings,
  type WorkspaceSettings,
} from "@/lib/settings";

export type OfflineOrder = {
  id: string;
  order_number: string | null;
  customer_name: string | null;
  phone: string | null;
  city: string | null;
  address: string | null;
  product: string | null;
  qty: string | null;
  product_total: number | null;
  delivery: string | null;
  advance: string | null;
  status: string | null;
  payment_method: string | null;
  cod_amount: number | null;
  order_text: string;
  customer_id: string | null;
  created_at: string;
};

export type OfflineInvoice = {
  id: string;
  invoice_number: string;
  customer_name: string | null;
  phone: string | null;
  total: number | null;
  payment_status: string;
  paid_at: string | null;
  payment_method: string | null;
  cod_amount: number | null;
  invoice_text: string;
  customer_id: string | null;
  created_at: string;
};

export type OfflineCustomer = {
  id: string;
  phone: string;
  name: string | null;
  city: string | null;
  address: string | null;
  created_at: string;
};

export type OfflineProduct = {
  name: string;
  unit: string;
  sale_price: number | null;
  p100_staff_price: number | null;
  p250_staff_price: number | null;
  p500_staff_price: number | null;
  stock: number | null;
  custom_sale_price: number | null;
  custom_p100_price: number | null;
  custom_p250_price: number | null;
  custom_p500_price: number | null;
};

export type OfflineTemplate = {
  id: string;
  kind: "order" | "confirmation";
  name: string;
  template_text: string;
  is_selected: boolean;
  created_at: string;
};

export type OfflineSyncLog = {
  synced_at: string;
  total_rows: number;
  updated_count: number;
  inserted_count: number;
  skipped_count: number;
  error_count: number;
  status: string;
};

export type OfflineDb = {
  orders: OfflineOrder[];
  invoices: OfflineInvoice[];
  customers: OfflineCustomer[];
  products: OfflineProduct[];
  templates: OfflineTemplate[];
  couriers: Array<{ id: string; name: string; source_file: string | null; config: unknown; updated_at: string }>;
  label: unknown;
  user: UserSettings;
  workspace: WorkspaceSettings;
  profileName: string;
  counters: { order: number; invoice: number };
  sync: OfflineSyncLog | null;
};

const KEY = "hbchem-offline-db:v1";

function empty(): OfflineDb {
  return {
    orders: [],
    invoices: [],
    customers: [],
    products: [],
    templates: [],
    couriers: [],
    label: null,
    user: { ...DEFAULT_USER_SETTINGS },
    workspace: { ...DEFAULT_WORKSPACE_SETTINGS, businessName: "HB Chemicals Pakistan" },
    profileName: "Offline User",
    counters: { order: 0, invoice: 0 },
    sync: null,
  };
}

let cache: OfflineDb | null = null;

export function db(): OfflineDb {
  if (cache) return cache;
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    cache = raw ? { ...empty(), ...(JSON.parse(raw) as OfflineDb) } : empty();
  } catch {
    cache = empty();
  }
  return cache;
}

export function commit() {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(KEY, JSON.stringify(db()));
  } catch {
    /* storage full — ignore */
  }
}

export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

export const now = () => new Date().toISOString();

/** Offline auto order number — workspace settings ke start number se aage chalta hai. */
export function nextOrderNumberOffline(): string {
  const d = db();
  const start = Number(d.workspace.orderNumberStart || 370);
  const next = Math.max(start, start + d.counters.order);
  d.counters.order += 1;
  commit();
  return String(next).padStart(5, "0");
}

export function nextInvoiceNumberOffline(): string {
  const d = db();
  d.counters.invoice += 1;
  commit();
  const prefix = d.workspace.invoicePrefix || "INV-";
  return `${prefix}${String(d.counters.invoice).padStart(5, "0")}`;
}

export const OFFLINE_USER_ID = "offline-user";

export function matches(haystack: Array<string | null | undefined>, search?: string) {
  const s = (search ?? "").trim().toLowerCase();
  if (!s) return true;
  return haystack.some((v) => (v ?? "").toLowerCase().includes(s));
}

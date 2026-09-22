import {
  DEFAULT_USER_SETTINGS,
  DEFAULT_WORKSPACE_SETTINGS,
  type UserSettings,
  type WorkspaceSettings,
} from "@/lib/settings";
import { commit, db } from "./store";

type Arg<T> = { data: T } | undefined;

export type MemberSectionRow = { userId: string; allowedSections: string[] };

export async function getMySettings() {
  const d = db();
  return {
    settings: { ...DEFAULT_USER_SETTINGS, ...d.user },
    workspace: { ...DEFAULT_WORKSPACE_SETTINGS, ...d.workspace },
    isAdmin: true,
    email: "offline@device",
    fullName: d.profileName,
  };
}

export async function saveMySettings(arg: Arg<Partial<UserSettings>>) {
  const d = db();
  d.user = { ...d.user, ...(arg?.data ?? {}) };
  commit();
  return { ok: true as const, message: "Settings save ho gayin" };
}

export async function saveMyProfileName(arg: Arg<{ fullName: string }>) {
  const d = db();
  d.profileName = arg!.data.fullName;
  commit();
  return { ok: true as const, message: "Naam update ho gaya" };
}

export async function getWorkspaceSettings() {
  return { ok: true as const, settings: { ...DEFAULT_WORKSPACE_SETTINGS, ...db().workspace }, message: "" };
}

export async function saveWorkspaceSettings(arg: Arg<Partial<WorkspaceSettings>>) {
  const d = db();
  d.workspace = { ...d.workspace, ...(arg?.data ?? {}) };
  commit();
  return { ok: true as const, message: "Workspace settings save ho gayin" };
}

export async function listMemberSections() {
  return { ok: true as const, members: [] as MemberSectionRow[] };
}

export async function saveMemberSections() {
  return { ok: false as const, message: "Offline app me team access change nahi hota." };
}

export async function exportMyRecordsCsv(arg: Arg<{ kind: "orders" | "invoices" | "customers" }>) {
  const d = db();
  const kind = arg?.data?.kind ?? "orders";
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  let csv = "";
  if (kind === "invoices") {
    csv = ["Invoice,Name,Phone,Total,Status,Date"]
      .concat(
        d.invoices.map((i) =>
          [i.invoice_number, i.customer_name, i.phone, i.total, i.payment_status, i.created_at].map(esc).join(","),
        ),
      )
      .join("\n");
  } else if (kind === "customers") {
    csv = ["Phone,Name,City,Address"]
      .concat(d.customers.map((c) => [c.phone, c.name, c.city, c.address].map(esc).join(",")))
      .join("\n");
  } else {
    csv = ["Order #,Name,Phone,City,Product,Qty,Total,Status,Date"]
      .concat(
        d.orders.map((o) =>
          [o.order_number, o.customer_name, o.phone, o.city, o.product, o.qty, o.product_total, o.status, o.created_at]
            .map(esc)
            .join(","),
        ),
      )
      .join("\n");
  }
  return { ok: true as const, csv, count: csv.split("\n").length - 1, message: "" };
}

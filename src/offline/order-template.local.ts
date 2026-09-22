import { DEFAULT_CONFIRMATION_TEMPLATE, DEFAULT_ORDER_TEMPLATE } from "@/lib/order-template";
import type { OrderTemplateRow } from "@/lib/order-template.functions";
import { commit, db, now, uid } from "./store";

type Kind = "order" | "confirmation";
type Arg<T> = { data: T } | undefined;

const fallbackFor = (kind: Kind) => (kind === "confirmation" ? DEFAULT_CONFIRMATION_TEMPLATE : DEFAULT_ORDER_TEMPLATE);

function loadAll(kind: Kind) {
  const templates: OrderTemplateRow[] = db()
    .templates.filter((t) => t.kind === kind)
    .map((t) => ({ id: t.id, name: t.name, template: t.template_text, isSelected: t.is_selected }));
  const selected = templates.find((t) => t.isSelected);
  return {
    templates,
    selectedId: selected?.id ?? null,
    template: selected?.template ?? fallbackFor(kind),
  };
}

export async function getOrderTemplate(arg?: Arg<{ kind?: Kind }>) {
  return loadAll(arg?.data?.kind ?? "order");
}

export async function saveOrderTemplate(arg: Arg<{ id?: string | null; name: string; template: string; kind?: Kind }>) {
  const data = arg!.data;
  const kind: Kind = data.kind ?? "order";
  const d = db();
  const clash = d.templates.find(
    (t) => t.kind === kind && t.name.toLowerCase() === data.name.trim().toLowerCase() && t.id !== data.id,
  );
  if (clash) throw new Error("Is naam se template pehle se mojood hai");

  for (const t of d.templates) if (t.kind === kind) t.is_selected = false;

  const existing = data.id ? d.templates.find((t) => t.id === data.id) : undefined;
  if (existing) {
    existing.name = data.name.trim();
    existing.template_text = data.template;
    existing.is_selected = true;
  } else {
    d.templates.push({
      id: uid(),
      kind,
      name: data.name.trim(),
      template_text: data.template,
      is_selected: true,
      created_at: now(),
    });
  }
  commit();
  return loadAll(kind);
}

export async function selectOrderTemplate(arg: Arg<{ id: string | null; kind?: Kind }>) {
  const kind: Kind = arg!.data.kind ?? "order";
  const d = db();
  for (const t of d.templates) if (t.kind === kind) t.is_selected = t.id === arg!.data.id;
  commit();
  return loadAll(kind);
}

export async function deleteOrderTemplate(arg: Arg<{ id: string; kind?: Kind }>) {
  const kind: Kind = arg!.data.kind ?? "order";
  const d = db();
  d.templates = d.templates.filter((t) => t.id !== arg!.data.id);
  commit();
  return loadAll(kind);
}

export async function resetOrderTemplate(arg?: Arg<{ kind?: Kind }>) {
  const kind: Kind = arg?.data?.kind ?? "order";
  const d = db();
  for (const t of d.templates) if (t.kind === kind) t.is_selected = false;
  commit();
  return loadAll(kind);
}

export type { OrderTemplateRow };

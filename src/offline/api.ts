/**
 * Offline replacements for the /api/* helpers. Desktop app me AI available nahi hoti,
 * is liye order/invoice formatting local rules se hoti hai.
 */
import { db, nextOrderNumberOffline } from "./store";

type UiMessage = { role?: string; parts?: Array<{ type?: string; text?: string }>; content?: string };

function textOf(m: UiMessage): string {
  if (typeof m?.content === "string") return m.content;
  return (m?.parts ?? [])
    .filter((p) => p?.type === "text" && p.text)
    .map((p) => p!.text as string)
    .join(" ");
}

function lastUserText(messages: UiMessage[]): string {
  const users = messages.filter((m) => m.role === "user");
  return textOf(users[users.length - 1] ?? {});
}

function localPhone(text: string): string {
  const m = text.match(/(?:\+?92|0)?3\d{2}[\s-]?\d{7}/);
  if (!m) return "";
  const digits = m[0].replace(/\D/g, "");
  const tail = digits.slice(-10);
  return tail.length === 10 ? `0${tail}` : "";
}

function labelled(text: string, keys: string[]): string {
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*\*?\s*([A-Za-z #/.]{2,25}?)\s*\*?\s*:\s*(.+)$/);
    if (!m) continue;
    const key = m[1].trim().toLowerCase();
    if (keys.includes(key)) return m[2].replace(/\*/g, "").trim();
  }
  return "";
}

/** Free text (ya labelled text) se order fields nikal kar template bhar deta hai. */
export function formatOrderOffline(text: string, template: string): string {
  const values: Record<string, string> = {
    order_number: labelled(text, ["order number", "order no", "order #"]) || nextOrderNumberOffline(),
    name: labelled(text, ["name", "customer", "customer name"]),
    phone: labelled(text, ["phone", "mobile", "contact"]) || localPhone(text),
    city: labelled(text, ["city"]),
    address: labelled(text, ["address"]),
    product: labelled(text, ["product", "products", "item", "items"]),
    qty: labelled(text, ["qty", "quantity"]),
    product_total: labelled(text, ["product total", "total", "amount"]),
    delivery: labelled(text, ["delivery", "delivery charges"]),
    advance: labelled(text, ["advance", "paid"]),
    status: labelled(text, ["status"]) || "Confirmed",
  };
  if (values.phone) values.phone = values.phone.replace(/\D/g, "").slice(-11);

  const filled = template.replace(/\{\{(\w+)\}\}/g, (_all, key: string) => values[key] ?? "");
  if (filled !== template) return filled;

  // Template plain "Label:" style hai — har line ke aage value laga do.
  const map: Array<[RegExp, string]> = [
    [/^order number/i, values.order_number],
    [/^name/i, values.name],
    [/^phone/i, values.phone],
    [/^city/i, values.city],
    [/^address/i, values.address],
    [/^product total/i, values.product_total],
    [/^product/i, values.product],
    [/^qty/i, values.qty],
    [/^delivery/i, values.delivery],
    [/^advance/i, values.advance],
    [/^status/i, values.status],
  ];
  return template
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      for (const [re, value] of map) {
        if (re.test(trimmed)) {
          const label = trimmed.split(":")[0];
          return `${label}: ${value}`.trimEnd();
        }
      }
      return line;
    })
    .join("\n");
}

const UNITS = /(\d+(?:\.\d+)?)\s*(kg|kilo|g|gram|gm|ml|litre|liter|ltr|l|pcs|piece)/i;

function priceFor(name: string, grams: number | null): number | null {
  const products = db().products;
  const lower = name.toLowerCase();
  const hit =
    products.find((p) => p.name.toLowerCase() === lower) ??
    products.find((p) => lower.includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(lower));
  if (!hit) return null;
  const unitRate = hit.custom_sale_price ?? hit.sale_price;
  const p100 = hit.custom_p100_price ?? hit.p100_staff_price;
  const p250 = hit.custom_p250_price ?? hit.p250_staff_price;
  const p500 = hit.custom_p500_price ?? hit.p500_staff_price;
  if (grams == null) return unitRate ?? null;
  if (grams <= 100 && p100 != null) return Math.round(p100 * (grams / 100));
  if (grams <= 250 && p250 != null) return Math.round(p250 * (grams / 250));
  if (grams <= 500 && p500 != null) return Math.round(p500 * (grams / 500));
  if (unitRate != null) return Math.round(unitRate * (grams / 1000));
  return null;
}

/** Local invoice builder — rate list se prices uthata hai. */
export function formatInvoiceOffline(text: string): string {
  const lines = text
    .split(/\r?\n|,/)
    .map((l) => l.trim())
    .filter((l) => l.length > 1);

  const items: Array<{ label: string; price: number | null }> = [];
  for (const line of lines) {
    const m = line.match(UNITS);
    let grams: number | null = null;
    if (m) {
      const qty = Number(m[1]);
      const unit = m[2].toLowerCase();
      grams = unit.startsWith("k") || unit === "l" || unit.startsWith("lit") ? qty * 1000 : qty;
    }
    const name = line.replace(UNITS, "").replace(/[^A-Za-z0-9 .-]/g, " ").trim();
    if (!name) continue;
    items.push({ label: line, price: priceFor(name, grams) });
  }

  const total = items.reduce((s, i) => s + (i.price ?? 0), 0);
  const body = items
    .map((item, i) => {
      const dots = ".".repeat(Math.max(4, 40 - item.label.length));
      return `${i + 1}. ${item.label}${dots} ${item.price ?? ""}`.trimEnd();
    })
    .join("\n\n");

  return `*INVOICE*\n\n${body}\n\nProduct Total: ${total.toLocaleString("en-US")}\n\nDelivery Charges:\n\nGrand Total:`;
}

function sseStream(text: string): Response {
  const encoder = new TextEncoder();
  const events = [
    { type: "start" },
    { type: "start-step" },
    { type: "text-start", id: "0" },
    { type: "text-delta", id: "0", delta: text },
    { type: "text-end", id: "0" },
    { type: "finish-step" },
    { type: "finish" },
  ];
  const stream = new ReadableStream({
    start(controller) {
      for (const e of events) controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "x-vercel-ai-ui-message-stream": "v1",
    },
  });
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
}

function confirmParse(text: string) {
  return {
    orderNumber: labelled(text, ["order number", "order no", "order #"]),
    name: labelled(text, ["name", "customer", "customer name"]),
    phone: labelled(text, ["phone", "mobile", "contact"]) || localPhone(text),
    city: labelled(text, ["city"]),
    address: labelled(text, ["address"]),
    notes: labelled(text, ["notes", "note"]),
    invoice: "",
    productTotal: "",
    delivery: "",
    advance: "",
  };
}

/** Desktop app me /api/* calls ko local handlers se jawab dete hain. */
export function installOfflineApi() {
  const original = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const path = url.startsWith("http") ? new URL(url).pathname : url.split("?")[0];
    if (!path.startsWith("/api/")) return original(input as never, init);

    let body: Record<string, unknown> = {};
    try {
      const raw = init?.body ?? (input instanceof Request ? await input.clone().text() : undefined);
      if (typeof raw === "string") body = JSON.parse(raw);
    } catch {
      body = {};
    }

    const messages = (body["messages"] as UiMessage[]) ?? [];

    if (path === "/api/chat") {
      const template = typeof body["template"] === "string" ? (body["template"] as string) : "";
      return sseStream(formatOrderOffline(lastUserText(messages), template));
    }
    if (path === "/api/invoice") {
      return sseStream(formatInvoiceOffline(lastUserText(messages)));
    }
    if (path === "/api/confirm-parse") {
      return jsonResponse(confirmParse(String(body["text"] ?? "")));
    }
    if (path === "/api/extract") {
      return new Response("Offline app me file se text nikalna available nahi hai.", { status: 503 });
    }
    return new Response("Offline", { status: 503 });
  };
}

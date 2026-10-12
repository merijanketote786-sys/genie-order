/**
 * Rule-based template engine (no AI). Input templates tell the parser which
 * label maps to which {{variable}}; output templates are filled with values.
 */
export type Vars = Record<string, string>;

const TOKEN_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/** Built-in aliases so common labels work even without an input template. */
const ALIASES: Record<string, string[]> = {
  order_number: ["order number", "order no", "order #", "order#", "invoice number", "invoice no", "order"],
  name: ["name", "naam", "customer name", "customer"],
  phone: ["phone", "phone number", "mobile", "mobile number", "number", "contact", "cell", "whatsapp", "ph", "no"],
  city: ["city", "shehar", "sheher"],
  address: ["address", "adress", "addres", "pata"],
  product: ["product", "products", "item", "items"],
  qty: ["qty", "quantity"],
  product_total: ["product total", "total", "amount", "price", "bill"],
  delivery: ["delivery", "delivery charges", "delivery charge", "dc", "shipping"],
  advance: ["advance"],
  status: ["status"],
  notes: ["notes", "note", "remarks", "instructions"],
  goods_adda: ["goods adda", "adda"],
  courier: ["courier", "courier service"],
};

export function tokensOf(template: string): string[] {
  const out: string[] = [];
  for (const m of template.matchAll(TOKEN_RE)) {
    const k = m[1]!.toLowerCase();
    if (!out.includes(k)) out.push(k);
  }
  return out;
}

export const humanize = (key: string) => key.replace(/_/g, " ").trim();
export const slugify = (label: string) =>
  label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);

const norm = (s: string) => s.toLowerCase().replace(/[*_~`•]/g, "").replace(/\s+/g, " ").trim();

/** Label → variable pairs taken from an input template ("Name: {{name}}"). */
export function inputLabels(inputTemplate: string): { label: string; key: string }[] {
  const pairs: { label: string; key: string }[] = [];
  for (const line of inputTemplate.split("\n")) {
    const m = line.match(/^(.*?)\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/);
    if (!m) continue;
    const key = m[2]!.toLowerCase();
    const label = norm(m[1]!.replace(/[:：=\-]+\s*$/, ""));
    pairs.push({ label: label || humanize(key), key });
  }
  return pairs;
}

/** Template with variables removed — a blank form the user can fill in. */
export function blankForm(inputTemplate: string) {
  return inputTemplate.replace(TOKEN_RE, "").replace(/[ \t]+$/gm, "");
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("92") && digits.length === 12) return `0${digits.slice(2)}`;
  if (digits.length === 10 && digits.startsWith("3")) return `0${digits}`;
  return digits || raw.trim();
}

const PHONE_RE = /(?:\+?92[\s-]?|0)3\d{2}[\s-]?\d{7}/;

/**
 * Reads a message using label lines. Labels come from the input template,
 * the output template's variables, and built-in aliases.
 */
export function parseMessage(text: string, opts: { inputTemplate?: string; extraKeys?: string[] } = {}) {
  const labels: { label: string; key: string }[] = [];
  const add = (label: string, key: string) => {
    const l = norm(label);
    if (l && !labels.some((x) => x.label === l)) labels.push({ label: l, key });
  };
  const fromInput = inputLabels(opts.inputTemplate ?? "");
  for (const p of fromInput) add(p.label, p.key);
  for (const k of opts.extraKeys ?? []) add(humanize(k), k);
  for (const [key, list] of Object.entries(ALIASES)) for (const l of list) add(l, key);
  labels.sort((a, b) => b.label.length - a.label.length);

  const vars: Vars = {};
  const unlabeled: string[] = [];
  let matched = 0;
  for (const raw of text.split("\n")) {
    const line = raw.replace(/^\s*[*\-•]\s*/, "").trim();
    if (!line) continue;
    const clean = line.replace(/[*_~]/g, "");
    let hit = false;
    for (const { label, key } of labels) {
      const m = clean.match(new RegExp(`^${escapeRe(label).replace(/ /g, "\\s*")}\\s*[:：=]\\s*(.*)$`, "i"))
        ?? clean.match(new RegExp(`^${escapeRe(label).replace(/ /g, "\\s*")}\\s+-\\s*(.*)$`, "i"));
      if (!m) continue;
      const value = m[1]!.trim();
      vars[key] = vars[key] && value ? `${vars[key]}, ${value}` : value || vars[key] || "";
      matched += 1;
      hit = true;
      break;
    }
    if (!hit) unlabeled.push(line);
  }

  // No labels at all → fill input-template variables line by line.
  if (matched === 0 && fromInput.length) {
    const rest = [...unlabeled];
    const phoneIdx = rest.findIndex((l) => PHONE_RE.test(l));
    if (phoneIdx >= 0 && fromInput.some((p) => p.key === "phone")) {
      vars["phone"] = rest[phoneIdx]!.match(PHONE_RE)![0];
      rest.splice(phoneIdx, 1);
    }
    for (const p of fromInput) {
      if (vars[p.key]) continue;
      const next = rest.shift();
      if (next === undefined) break;
      vars[p.key] = next;
    }
  } else if (!vars["phone"]) {
    const found = text.match(PHONE_RE)?.[0];
    if (found) vars["phone"] = found;
  }

  if (vars["phone"]) vars["phone"] = normalizePhone(vars["phone"]);
  return { vars, unlabeled };
}

/**
 * Fills an output template. Supports {{variables}} anywhere and label-only
 * lines like "Name: " (value placed after the colon).
 */
export function fillTemplate(template: string, vars: Vars): string {
  const labelKey = (label: string): string | null => {
    const l = norm(label);
    if (vars[slugify(l)] !== undefined) return slugify(l);
    for (const [key, list] of Object.entries(ALIASES)) if (list.includes(l)) return key;
    return null;
  };
  return template
    .split("\n")
    .map((line) => {
      if (TOKEN_RE.test(line)) {
        TOKEN_RE.lastIndex = 0;
        return line.replace(TOKEN_RE, (_, k: string) => vars[k.toLowerCase()] ?? "");
      }
      const m = line.match(/^(\s*[^:]{1,40}:)\s*$/);
      if (m) {
        const key = labelKey(m[1]!.replace(/:$/, ""));
        if (key && vars[key]) return `${m[1]} ${vars[key]}`;
      }
      return line;
    })
    .join("\n")
    .trim();
}

/** Replaces any remaining {{tokens}} with values (blank when missing). */
export function fillTokens(text: string, vars: Vars) {
  return text.replace(TOKEN_RE, (_, k: string) => vars[k.toLowerCase()] ?? "");
}

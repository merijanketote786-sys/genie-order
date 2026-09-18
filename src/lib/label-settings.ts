/**
 * Per-user label designer settings — printer profiles, text blocks aur barcode block.
 * Har user ka apna config hota hai (DB me user_id scoped, doosre user ko nahi dikhta).
 */

export const BARCODE_FORMATS = [
  "CODE128",
  "CODE39",
  "EAN13",
  "EAN8",
  "UPC",
  "ITF14",
  "MSI",
  "codabar",
  "pharmacode",
] as const;
export type BarcodeFormat = (typeof BARCODE_FORMATS)[number];

export type PrinterProfile = {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
  dpi: 203 | 300 | 600;
  gapMm: number;
  marginMm: number;
};

export type TextAlign = "left" | "center" | "right";

/** Print-safe font families — thermal printers pe reliably render hote hain. */
export const FONT_FAMILIES = [
  { label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { label: "Helvetica", value: "Helvetica, Arial, sans-serif" },
  { label: "Verdana", value: "Verdana, Geneva, sans-serif" },
  { label: "Tahoma", value: "Tahoma, Verdana, sans-serif" },
  { label: "Trebuchet", value: "'Trebuchet MS', Tahoma, sans-serif" },
  { label: "Times", value: "'Times New Roman', Times, serif" },
  { label: "Georgia", value: "Georgia, 'Times New Roman', serif" },
  { label: "Courier", value: "'Courier New', Courier, monospace" },
  { label: "Impact", value: "Impact, Haettenschweiler, sans-serif" },
] as const;

export const DEFAULT_FONT_FAMILY = FONT_FAMILIES[0].value;

export type LabelField = {
  id: string;
  label: string;
  template: string;
  enabled: boolean;
  xMm: number;
  yMm: number;
  widthMm: number;
  fontPt: number;
  fontFamily: string;
  bold: boolean;
  italic: boolean;
  uppercase: boolean;
  underline: boolean;
  align: TextAlign;
};

export type BarcodeBlock = {
  enabled: boolean;
  format: BarcodeFormat;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  moduleWidth: number;
  showText: boolean;
  textPt: number;
};

export type LabelConfig = {
  printers: PrinterProfile[];
  activePrinterId: string;
  fields: LabelField[];
  barcode: BarcodeBlock;
};

/** Common barcode label stocks — har brand (TSC, Zebra, Godex, Xprinter, Argox…) ke liye chalte hain. */
export const PRINTER_PRESETS: Array<Omit<PrinterProfile, "id">> = [
  { name: "TSC 244 Pro — 50 x 25 mm", widthMm: 50, heightMm: 25, dpi: 203, gapMm: 2, marginMm: 1 },
  { name: "TSC 244 Pro — 38 x 25 mm", widthMm: 38, heightMm: 25, dpi: 203, gapMm: 2, marginMm: 1 },
  { name: "TSC 244 Pro — 50 x 30 mm", widthMm: 50, heightMm: 30, dpi: 203, gapMm: 2, marginMm: 1 },
  { name: "Zebra / Godex — 40 x 30 mm", widthMm: 40, heightMm: 30, dpi: 203, gapMm: 2, marginMm: 1 },
  { name: "Xprinter — 60 x 40 mm", widthMm: 60, heightMm: 40, dpi: 203, gapMm: 2, marginMm: 1 },
  { name: "Shipping label — 100 x 150 mm", widthMm: 100, heightMm: 150, dpi: 203, gapMm: 3, marginMm: 2 },
];

export const FIELD_VARIABLES = [
  "{{business}}",
  "{{name}}",
  "{{price}}",
  "{{currency}}",
  "{{pack}}",
  "{{code}}",
  "{{qty}}",
  "{{date}}",
] as const;

export function defaultPrinter(): PrinterProfile {
  return { id: "default", ...PRINTER_PRESETS[0]! };
}

export function defaultConfig(): LabelConfig {
  return {
    printers: [defaultPrinter()],
    activePrinterId: "default",
    fields: [
      {
        id: "business",
        label: "Business",
        template: "{{business}}",
        enabled: true,
        xMm: 2,
        yMm: 1.5,
        widthMm: 46,
        fontPt: 11,
        fontFamily: DEFAULT_FONT_FAMILY,
        bold: true,
        italic: false,
        uppercase: true,
        underline: true,
        align: "center",
      },
      {
        id: "name",
        label: "Product",
        template: "{{name}}",
        enabled: true,
        xMm: 2,
        yMm: 8.5,
        widthMm: 46,
        fontPt: 13,
        fontFamily: DEFAULT_FONT_FAMILY,
        bold: true,
        italic: false,
        uppercase: true,
        underline: false,
        align: "center",
      },
      {
        id: "price",
        label: "Pack / Price",
        template: "{{pack}}",
        enabled: true,
        xMm: 2,
        yMm: 16.5,
        widthMm: 46,
        fontPt: 10,
        fontFamily: DEFAULT_FONT_FAMILY,
        bold: true,
        italic: false,
        uppercase: false,
        underline: false,
        align: "center",
      },
    ],
    barcode: {
      enabled: false,
      format: "CODE128",
      xMm: 5,
      yMm: 17,
      widthMm: 40,
      heightMm: 7,
      moduleWidth: 1.4,
      showText: true,
      textPt: 6,
    },
  };
}

/** DB/unknown JSON ko safe config me badalta hai. */
export function normalizeConfig(raw: unknown): LabelConfig {
  const base = defaultConfig();
  if (!raw || typeof raw !== "object") return base;
  const c = raw as Partial<LabelConfig>;
  const printers =
    Array.isArray(c.printers) && c.printers.length
      ? c.printers.map((p, i) => ({
          id: String(p?.id ?? `p${i}`),
          name: String(p?.name ?? `Printer ${i + 1}`),
          widthMm: num(p?.widthMm, 50, 5, 300),
          heightMm: num(p?.heightMm, 25, 5, 300),
          dpi: ([203, 300, 600] as number[]).includes(Number(p?.dpi)) ? (Number(p?.dpi) as 203) : 203,
          gapMm: num(p?.gapMm, 2, 0, 20),
          marginMm: num(p?.marginMm, 1, 0, 20),
        }))
      : base.printers;
  const fields =
    Array.isArray(c.fields) && c.fields.length
      ? c.fields.map((f, i) => ({
          id: String(f?.id ?? `f${i}`),
          label: String(f?.label ?? `Text ${i + 1}`),
          template: String(f?.template ?? ""),
          enabled: f?.enabled !== false,
          xMm: num(f?.xMm, 1, -50, 300),
          yMm: num(f?.yMm, 1, -50, 300),
          widthMm: num(f?.widthMm, 40, 2, 300),
          fontPt: num(f?.fontPt, 7, 3, 72),
          fontFamily: String(f?.fontFamily ?? DEFAULT_FONT_FAMILY) || DEFAULT_FONT_FAMILY,
          bold: Boolean(f?.bold),
          italic: Boolean(f?.italic),
          uppercase: Boolean(f?.uppercase),
          underline: Boolean(f?.underline),
          align: (["left", "center", "right"] as string[]).includes(String(f?.align))
            ? (f!.align as TextAlign)
            : "center",
        }))
      : base.fields;
  const b = (c.barcode ?? {}) as Partial<BarcodeBlock>;
  return {
    printers,
    activePrinterId: printers.some((p) => p.id === c.activePrinterId)
      ? String(c.activePrinterId)
      : printers[0]!.id,
    fields,
    barcode: {
      enabled: b.enabled !== false,
      format: (BARCODE_FORMATS as readonly string[]).includes(String(b.format))
        ? (b.format as BarcodeFormat)
        : "CODE128",
      xMm: num(b.xMm, 5, -50, 300),
      yMm: num(b.yMm, 11.5, -50, 300),
      widthMm: num(b.widthMm, 40, 5, 300),
      heightMm: num(b.heightMm, 9, 2, 200),
      moduleWidth: num(b.moduleWidth, 1.6, 0.6, 6),
      showText: b.showText !== false,
      textPt: num(b.textPt, 6, 3, 30),
    },
  };
}

function num(v: unknown, fallback: number, min: number, max: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export type LabelValues = {
  business: string;
  name: string;
  price: string;
  currency: string;
  pack: string;
  code: string;
  qty: string;
  date: string;
};

/** Template ke {{variables}} bharta hai aur khali tukde saaf karta hai. */
export function renderTemplate(template: string, values: LabelValues) {
  const out = template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key: string) => {
    const v = (values as Record<string, string>)[key];
    return v == null ? "" : v;
  });
  return out
    .replace(/\s*\/\s*$/g, "")
    .replace(/^\s*\/\s*/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

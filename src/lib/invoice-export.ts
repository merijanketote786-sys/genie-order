/** Invoice export helpers — PDF + Excel. Sirf presentation, koi rate logic nahi. */

const DELIVERY_RE = /delivery\s*charges?\s*:/i;
const PRODUCT_TOTAL_RE = /product\s*total\s*:/i;
const GRAND_TOTAL_RE = /grand\s*total\s*:/i;

function parseAmount(value: string): number | null {
  const match = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/g);
  if (!match || match.length === 0) return null;
  const n = Number(match[match.length - 1]);
  return Number.isFinite(n) ? n : null;
}

function formatAmount(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export type DeliveryOptions = {
  /** User ka likha hua delivery charges (khali ho sakta hai) */
  delivery: string;
  /** Invoice mein Delivery Charges line show karni hai ya nahi */
  showDelivery: boolean;
};

/** Delivery choice ke mutabiq invoice text update karta hai (Grand Total bhi) */
export function applyDeliveryChoice(text: string, opts: DeliveryOptions): string {
  const deliveryRaw = opts.delivery.trim();
  const deliveryNum = deliveryRaw ? parseAmount(deliveryRaw) : null;

  let productTotal: number | null = null;
  for (const line of text.split("\n")) {
    if (PRODUCT_TOTAL_RE.test(line)) {
      productTotal = parseAmount(line.replace(PRODUCT_TOTAL_RE, ""));
    }
  }

  const out: string[] = [];
  for (const line of text.split("\n")) {
    if (DELIVERY_RE.test(line)) {
      if (!opts.showDelivery) continue;
      out.push(`Delivery Charges: ${deliveryRaw}`.trimEnd());
      continue;
    }
    if (GRAND_TOTAL_RE.test(line)) {
      const grand =
        productTotal !== null ? productTotal + (deliveryNum ?? 0) : null;
      out.push(grand !== null ? `Grand Total: ${formatAmount(grand)}` : line);
      continue;
    }
    out.push(line);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n");
}

function fileStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

export async function exportInvoicePdf(text: string, fileBase = "invoice") {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 48;
  const pageHeight = doc.internal.pageSize.getHeight();
  const width = doc.internal.pageSize.getWidth() - margin * 2;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("HB Chemicals Pakistan", margin, margin);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(110);
  doc.text("Invoice", margin, margin + 16);
  doc.setDrawColor(210);
  doc.line(margin, margin + 26, margin + width, margin + 26);

  doc.setTextColor(20);
  doc.setFont("courier", "normal");
  doc.setFontSize(11);
  const lines = doc.splitTextToSize(text.replace(/\*/g, ""), width) as string[];
  let y = margin + 50;
  for (const line of lines) {
    if (y > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
    doc.text(line, margin, y);
    y += 16;
  }
  doc.save(`${fileBase}-${fileStamp()}.pdf`);
}

export async function exportInvoiceExcel(text: string, fileBase = "invoice") {
  const XLSX = await import("xlsx");
  const rows: (string | number)[][] = [["HB Chemicals Pakistan"], ["Invoice"], []];

  for (const raw of text.split("\n")) {
    const line = raw.replace(/\*/g, "").trimEnd();
    if (!line.trim()) {
      rows.push([]);
      continue;
    }
    const dotted = line.match(/^(.*?)[.\s]{2,}([\d,]+(?:\.\d+)?)$/);
    if (dotted && dotted[1].trim()) {
      const amount = Number(dotted[2].replace(/,/g, ""));
      rows.push([dotted[1].trim(), Number.isFinite(amount) ? amount : dotted[2]]);
      continue;
    }
    const labelled = line.match(/^(.*?:)\s*(.*)$/);
    if (labelled) {
      const value = labelled[2].trim();
      const num = value ? Number(value.replace(/,/g, "")) : "";
      rows.push([labelled[1].trim(), value && Number.isFinite(num) ? num : value]);
      continue;
    }
    rows.push([line.trim()]);
  }

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = [{ wch: 48 }, { wch: 16 }];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Invoice");
  XLSX.writeFile(book, `${fileBase}-${fileStamp()}.xlsx`);
}

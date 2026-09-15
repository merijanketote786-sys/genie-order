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

type InvoiceItem = {
  number: string;
  description: string;
  amount: string;
};

type InvoiceField = {
  label: string;
  value: string;
};

type ParsedInvoice = {
  invoiceNumber: string;
  invoiceDate: string;
  customer: InvoiceField[];
  items: InvoiceItem[];
  productTotal: string;
  delivery: string;
  showDelivery: boolean;
  grandTotal: string;
  payment: string[];
  notes: string[];
};

const CUSTOMER_LABELS = /^(customer|customer name|name|phone|mobile|city|address|billing address|ship to)\s*:/i;
const PAYMENT_LABELS = /^(payment|payment details|bank|bank name|account|account title|account number|iban|easypaisa|jazzcash)\s*:/i;
const NOTES_LABELS = /^(note|notes|remarks|terms|instructions)\s*:/i;

function cleanPdfText(value: string): string {
  return value
    .replace(/\*/g, "")
    .replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7E\n]/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

/** Existing plain-text invoice ko presentation-only structured data mein badalta hai. */
export function parseInvoiceText(text: string, now = new Date()): ParsedInvoice {
  const customer: InvoiceField[] = [];
  const items: InvoiceItem[] = [];
  const payment: string[] = [];
  const notes: string[] = [];
  let productTotal = "";
  let delivery = "";
  let showDelivery = false;
  let grandTotal = "";
  let invoiceNumber = "";
  let invoiceDate = "";

  for (const rawLine of text.split("\n")) {
    const line = cleanPdfText(rawLine);
    if (!line || /^invoice$/i.test(line)) continue;

    const item = line.match(/^(\d+)[.)]\s*(.*?)(?:\.{2,}|\s{2,})\s*([\d,]+(?:\.\d+)?)\s*$/);
    if (item) {
      items.push({ number: item[1], description: item[2].trim(), amount: item[3].trim() });
      continue;
    }

    const labelled = line.match(/^([^:]+):\s*(.*)$/);
    if (labelled) {
      const label = labelled[1].trim();
      const value = labelled[2].trim();
      if (PRODUCT_TOTAL_RE.test(`${label}:`)) productTotal = value;
      else if (DELIVERY_RE.test(`${label}:`)) {
        showDelivery = true;
        delivery = value;
      } else if (GRAND_TOTAL_RE.test(`${label}:`)) grandTotal = value;
      else if (/^invoice\s*(#|no\.?|number)$/i.test(label)) invoiceNumber = value;
      else if (/^(invoice\s*)?date$/i.test(label)) invoiceDate = value;
      else if (CUSTOMER_LABELS.test(`${label}:`)) customer.push({ label, value });
      else if (PAYMENT_LABELS.test(`${label}:`)) payment.push(`${label}: ${value}`.trimEnd());
      else if (NOTES_LABELS.test(`${label}:`)) notes.push(`${label}: ${value}`.trimEnd());
      continue;
    }

    const looseItem = line.match(/^(\d+)[.)]\s*(.+)$/);
    if (looseItem) {
      items.push({ number: looseItem[1], description: looseItem[2].trim(), amount: "" });
      continue;
    }

    if (/^(payment|bank|account|iban|easypaisa|jazzcash)\b/i.test(line)) payment.push(line);
    else if (/^(note|notes|remarks|terms|instructions)\b/i.test(line)) notes.push(line);
  }

  const generatedRef = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  return {
    invoiceNumber: invoiceNumber || generatedRef,
    invoiceDate: invoiceDate || now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
    customer,
    items,
    productTotal,
    delivery,
    showDelivery,
    grandTotal,
    payment,
    notes,
  };
}

export async function buildInvoicePdfFile(text: string, fileBase = "invoice"): Promise<File> {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait", compress: true });
  const invoice = parseInvoiceText(text);
  const navy: [number, number, number] = [13, 34, 64];
  const white: [number, number, number] = [255, 255, 255];
  const margin = 44;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - margin * 2;

  const drawHeader = (continuation = false) => {
    doc.setFillColor(...navy);
    doc.rect(0, 0, pageWidth, 106, "F");
    doc.setDrawColor(...white);
    doc.setLineWidth(1.2);
    doc.roundedRect(margin, 28, 46, 46, 4, 4, "S");
    doc.setTextColor(...white);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("HB", margin + 23, 57, { align: "center" });
    doc.setFontSize(14);
    doc.text("HB CHEMICALS PAKISTAN", margin + 60, 48);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text("Professional Chemical Products & Supplies", margin + 60, 64);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(continuation ? 17 : 25);
    doc.text(continuation ? "INVOICE - CONTINUED" : "INVOICE", pageWidth - margin, 51, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text(`Invoice # ${invoice.invoiceNumber}`, pageWidth - margin, 68, { align: "right" });
    doc.text(invoice.invoiceDate, pageWidth - margin, 82, { align: "right" });
  };

  const drawFooter = (pageNo: number, totalPages: number) => {
    const y = pageHeight - 30;
    doc.setDrawColor(...navy);
    doc.setLineWidth(0.6);
    doc.line(margin, y - 10, pageWidth - margin, y - 10);
    doc.setTextColor(...navy);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text("HB Chemicals Pakistan", margin, y + 4);
    doc.text("Thank you for your business.", pageWidth / 2, y + 4, { align: "center" });
    doc.text(`Page ${pageNo} of ${totalPages}`, pageWidth - margin, y + 4, { align: "right" });
  };

  drawHeader();
  let startY = 126;

  if (invoice.customer.length > 0) {
    doc.setDrawColor(...navy);
    doc.setLineWidth(0.7);
    doc.roundedRect(margin, startY, contentWidth, 58, 3, 3, "S");
    doc.setFillColor(...navy);
    doc.rect(margin, startY, 88, 58, "F");
    doc.setTextColor(...white);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("BILL TO", margin + 14, startY + 22);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text("Customer details", margin + 14, startY + 36);
    doc.setTextColor(...navy);
    doc.setFontSize(8.5);
    const customerText = invoice.customer.map((field) => `${field.label}: ${field.value}`).join("   |   ");
    const customerLines = doc.splitTextToSize(customerText, contentWidth - 114) as string[];
    doc.text(customerLines.slice(0, 3), margin + 104, startY + 19, { lineHeightFactor: 1.45 });
    startY += 76;
  }

  autoTable(doc, {
    startY,
    margin: { left: margin, right: margin, top: 122, bottom: 88 },
    head: [["#", "ITEM DESCRIPTION", "AMOUNT (PKR)"]],
    body: invoice.items.length > 0
      ? invoice.items.map((item) => [item.number, item.description, item.amount])
      : [["-", "Invoice details", "-"]],
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 9.5,
      textColor: navy,
      fillColor: white,
      lineColor: navy,
      lineWidth: 0.45,
      cellPadding: { top: 8, right: 8, bottom: 8, left: 8 },
      overflow: "linebreak",
      valign: "middle",
      minCellHeight: 30,
    },
    headStyles: {
      font: "helvetica",
      fontStyle: "bold",
      fontSize: 8.5,
      textColor: white,
      fillColor: navy,
      lineColor: navy,
      halign: "left",
      minCellHeight: 30,
    },
    columnStyles: {
      0: { cellWidth: 38, halign: "center", fontStyle: "bold" },
      1: { cellWidth: "auto" },
      2: { cellWidth: 112, halign: "right", fontStyle: "bold" },
    },
    rowPageBreak: "avoid",
    showHead: "everyPage",
    didDrawPage: (data) => {
      if (data.pageNumber > 1) drawHeader(true);
    },
  });

  const tableEndY = (doc as typeof doc & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? startY;
  const totalsRows: Array<[string, string]> = [["PRODUCT TOTAL", invoice.productTotal || "-"]];
  if (invoice.showDelivery) totalsRows.push(["DELIVERY CHARGES", invoice.delivery || "-"]);
  totalsRows.push(["GRAND TOTAL", invoice.grandTotal || "-"]);

  autoTable(doc, {
    startY: tableEndY + 16,
    margin: { left: pageWidth - margin - 238, right: margin, top: 122, bottom: 88 },
    body: totalsRows,
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 9.5,
      textColor: navy,
      fillColor: white,
      lineColor: navy,
      lineWidth: 0.55,
      cellPadding: 8,
      minCellHeight: 28,
    },
    columnStyles: {
      0: { cellWidth: 138, fontStyle: "bold" },
      1: { cellWidth: 100, halign: "right", fontStyle: "bold" },
    },
    didParseCell: (data) => {
      if (data.row.index === totalsRows.length - 1) {
        data.cell.styles.fillColor = navy;
        data.cell.styles.textColor = white;
        data.cell.styles.fontSize = 11;
        data.cell.styles.minCellHeight = 34;
      }
    },
    rowPageBreak: "avoid",
    pageBreak: "avoid",
    didDrawPage: (data) => {
      if (data.pageNumber > 1) drawHeader(true);
    },
  });

  let detailY = (doc as typeof doc & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? tableEndY;
  const drawDetailBlock = (title: string, values: string[]) => {
    if (values.length === 0) return;
    const body = values.join("\n");
    const lines = doc.splitTextToSize(body, contentWidth - 24) as string[];
    const height = Math.max(48, 27 + lines.length * 11);
    if (detailY + 14 + height > pageHeight - 64) {
      doc.addPage();
      drawHeader(true);
      detailY = 122;
    } else detailY += 14;
    doc.setDrawColor(...navy);
    doc.roundedRect(margin, detailY, contentWidth, height, 3, 3, "S");
    doc.setTextColor(...navy);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text(title, margin + 12, detailY + 17);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text(lines, margin + 12, detailY + 32, { lineHeightFactor: 1.3 });
    detailY += height;
  };

  drawDetailBlock("PAYMENT DETAILS", invoice.payment);
  drawDetailBlock("NOTES", invoice.notes);

  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    drawFooter(page, totalPages);
  }

  const name = `${fileBase}-${fileStamp()}.pdf`;
  const blob = doc.output("blob");
  return new File([blob], name, { type: "application/pdf" });
}

export async function exportInvoicePdf(text: string, fileBase = "invoice") {
  const file = await buildInvoicePdfFile(text, fileBase);
  downloadFile(file);
}

export async function buildInvoiceExcelFile(text: string, fileBase = "invoice"): Promise<File> {
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
  const data = XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  const name = `${fileBase}-${fileStamp()}.xlsx`;
  return new File([data], name, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export async function exportInvoiceExcel(text: string, fileBase = "invoice") {
  const file = await buildInvoiceExcelFile(text, fileBase);
  downloadFile(file);
}

export function downloadFile(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * File ko WhatsApp par bhejta hai.
 * Mobile (Web Share Level 2) par share sheet khulti hai jahan file ke saath WhatsApp chuna ja sakta hai.
 * Desktop par browser file ko WhatsApp chat mein directly attach nahi kar sakta —
 * is liye file download hoti hai aur chat khul jati hai jahan ek tap se attach ki ja sakti hai.
 */
export async function shareInvoiceFile(file: File, whatsappOpen: () => void): Promise<"shared" | "downloaded"> {
  const nav = navigator as Navigator & {
    canShare?: (data: { files: File[] }) => boolean;
    share?: (data: { files: File[]; title?: string; text?: string }) => Promise<void>;
  };
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (isMobile && nav.share) {
    try {
      // Pehle file-only share try karein — kuch devices text ke saath files reject karte hain
      if (nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file] });
        return "shared";
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return "shared";
      // share fail — neeche download fallback
    }
  }
  downloadFile(file);
  whatsappOpen();
  return "downloaded";
}

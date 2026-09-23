# Printing and business settings upgrade (in phases)

This builds on the POS you already have: the current bill screen, receipt printing, POS Settings (stored on the server, per workspace), the Staff/PIN system and Vyapar sync all stay. Nothing is rebuilt from scratch. The work is split into 4 phases, and each one is tested before the next starts.

## An honest note on printers
A website running in the browser **cannot see or pick printers on its own**. The browser's print window is the only thing it can open. So:
- **In the browser:** we pick the correct paper size, margins and layout for you. You choose the printer once in the print window, and Chrome usually remembers it after that. A "Printers" list stores your named printer setups (for example "Counter 80mm" or "Office A5") with their paper size and default role. It will not show fake "online" or "offline" status.
- **In your Windows desktop app:** the desktop app (Electron) can really list the printers installed on Windows and print straight to a chosen one with no print window (silent print). Printer discovery, test print, and "print straight to the default POS printer" work fully here, with the real status Windows reports.

## Phase A: Central print engine and layouts
- One print system shared by POS bills, sales invoices, quotations, sales and purchase returns, purchases, customer and supplier statements, payment receipts, expenses and reports.
- Separate layouts, not scaled copies: **A4**, **A5** (its own compact layout, portrait or landscape), **Thermal 58mm**, **Thermal 80mm**, and **Custom** width × height.
- 6 designs: Modern, Classic, Compact, Minimal, Retail, Thermal. You can set a default design for each paper size.
- A print preview window showing the real paper size, with Print, Download PDF and Cancel.
- Print, Reprint, PDF and Share after a sale. A reprint never creates a new sale, and every reprint is recorded in the audit log.
- Copies: 1, 2 or a custom number. Thermal extras: text wrapping, qty × rate lines, bold grand total, optional barcode/QR, and blank lines after the receipt.

## Phase B: Invoice design and print settings (saved per business)
- Show or hide each field: logo, business details, NTN/GST, customer info, SKU, barcode, qty, unit, rate, discount, tax, totals, paid, balance, payment method, notes, terms, footer and signature.
- Margins, font sizes (body, table, header, footer), logo size and alignment, column visibility and width, and line spacing.
- A5 and thermal each get their own settings group.
- A default paper size for each document type (for example POS 80mm, invoice A5, detailed invoice A4).
- Print behavior for each type: print automatically, ask first, or never.
- A default printer for each role: Sales, POS, A4, A5, Thermal and Reports.

## Phase C: New Settings hub with search
One Settings page with a side menu and a **global search box** (typing "printer", "discount" or "barcode" jumps to the matching settings). Sections: Business, POS, Sales, Purchases, Inventory, Customers, Suppliers, Payments, Taxes, Invoices, Printing, Printers, Users & Permissions, Notifications, Backup & Data, Vyapar Sync, Audit Logs, Advanced (admin only).
- Settings that actually change how the app works, including:
  - negative stock allowed or blocked
  - customer required for credit sales
  - credit limit enforcement
  - maximum cashier discount
  - payment methods on/off, with custom methods and a default
  - named tax rates, and prices with or without tax included
  - decimal places and currency symbol
  - separate number prefixes for invoices, quotations, purchases and returns
  - low-stock level
  - barcode auto-add
  - what happens after a sale
- Risky changes show a confirmation first (negative stock, currency change, number reset). Past bills and money records are never changed.

## Phase D: Permissions, data, sync, audit, notifications
- New permissions: edit sale, return sale, manage customers, manage suppliers, manage printers. Manager PIN approval for sensitive actions.
- Backup & Data: CSV/Excel export of products, customers, suppliers, sales, purchases and payments, plus the full backup (already exists), with the last backup time shown.
- Vyapar Sync page: last sync, status, how many rows were synced or failed, the last error, sync history, and buttons for manual sync and retry. It still uses the same single product list.
- Audit log viewer with filters: price changes, discounts, cancellations, returns, stock changes, payments, settings changes, printer changes, role changes and reprints.
- Notifications shown inside the app for low stock, credit limit, failed sync and print errors.
- **Not included:** session timeout and single-login-only rules. These depend on sign-in settings the app cannot safely control, so the Advanced section will list them as not available instead of showing switches that don't work.

## Technical details
- All business-level settings go into `pos_settings.config` (JSONB, per workspace) through the existing `pos_save_settings` function, whose checks are extended. Device-only choices (which saved printer this PC uses) stay on the device, but printer setups themselves are stored on the server.
- A new `src/lib/print/` module: one shared document format → layout renderers (a4, a5, thermal58, thermal80, custom) × designs → one HTML builder, used for printing, preview (an iframe at the real mm size) and PDF (jsPDF + html2canvas, already installed).
- The desktop app bridge: `electron/main.cjs` gets `webContents.getPrintersAsync()` and silent `print({deviceName, pageSize})` through a preload script. The web app detects `window.hbPrint` and uses it when available, otherwise it falls back to the browser print window.
- Numbering: new per-type prefix settings are read inside `pos_save_sale` and `pos_save_purchase`. Existing number sequences and past invoice numbers stay as they are.
- New server-side checks inside the existing save functions: negative stock, credit limit, maximum discount and required customer, each with a clear error message.
- The audit log gets `reprint`, `settings_change` and `printer_change` entries, plus a filtered viewer.

After you approve, I'll start with Phase A and test each phase before moving on.

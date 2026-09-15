# Premium Corporate Invoice PDF

## Goal
Redesign only the generated PDF presentation into a print-ready Navy Blue and White A4 invoice. Keep invoice calculations, delivery handling, Excel export, WhatsApp sharing, APIs, and database unchanged.

## Implementation
- Parse the existing invoice text into structured item rows and supported labelled details without changing their values.
- Build a professional A4 PDF with safe margins, an HB monogram/company header, prominent INVOICE title, generated invoice reference, and export date.
- Add a clean billing/customer section when customer details exist in the invoice text.
- Render products in a true table with navy header, white bold labels, wrapped descriptions, aligned quantities/rates/amounts where the source supports them, and repeated headers on later pages.
- Keep totals together, align them on the right, and emphasize Grand Total; include payment details, notes, and footer only when present/appropriate.
- Add automatic page breaks, page numbers, repeated company identity, and long-text wrapping without reducing body text excessively.

## Validation
- Generate and visually inspect a short invoice PDF.
- Generate and visually inspect a multi-page invoice containing long product names and many rows.
- Verify no clipping, overlap, broken text, misplaced totals, or missing repeated headers.
- Confirm existing delivery calculations and file-sharing/export flows remain unchanged.

## Technical details
- Use jsPDF with its table helper for reliable A4 pagination and repeated table headers.
- Use PDF-safe Helvetica throughout and a strict navy/white palette.
- Keep the existing exported function names so no calling UI changes are required.

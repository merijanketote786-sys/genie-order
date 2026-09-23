# POS ko poora Vyapar-style business system banana (phases me)

Ye bohot bara kaam hai (20+ modules). Sab ek saath banane se galtiyan aur toot-phoot ka khatra hai, is liye isay 6 phases me banaya jayega. Har phase mukammal, asli database ke sath, test ho kar deliver hoga. Aap ka purana data (products, rates, customers, orders, invoices, Vyapar sync) waise ka waisa rahega.

## Phase 1 — Buniyaad (database + billing core)
- Naye tables: sales, sale items, payments (split payment), stock movements (stock ledger), suppliers, purchases, purchase items, returns, expenses, customer ledger entries, audit log, held bills/quotations.
- Maujooda products table me sirf naye optional columns: SKU, barcode, category, brand, purchase price, wholesale price, min sale price, min stock, tax %. Purani 100g/250g/500g pricing aur Vyapar sync bilkul nahi badlegi.
- Customers me: email, opening balance, credit limit.
- Ek database function jo sale ek hi transaction me save kare: invoice + items + payments + stock kam + customer ledger. Kuch fail ho to kuch bhi save na ho.
- Purane invoices (Invoices section) me har POS sale ka record bhi banta rahega, taake history/dashboard na toote.

## Phase 2 — Billing screen upgrade
- Search: naam, SKU, barcode, category; category tabs; grid/list.
- Tax (multiple rates), item notes, invoice notes, % ya fixed discount.
- Customer balance + purana udhaar dikhana, walk-in.
- Payment: Cash, Bank, JazzCash, Easypaisa, Card, Other, Udhaar, split payment; change/balance auto.
- Hold bill / wapas lana, Quotation save + invoice me convert.
- Invoice print: A4, thermal 80mm, compact 58mm; PDF download; WhatsApp share.
- Shortcuts: F2 naya bill, F4 search, F8 payment, F9 save+print, +/- qty.

## Phase 3 — Returns, Purchases, Suppliers
- Sales return: invoice dhoondein, poora/partial return, refund ya customer credit, stock wapas; asal invoice kabhi edit nahi, alag return record.
- Purchase invoice, supplier, credit purchase, purchase return; stock khud barhta hai.
- Supplier ledger, "Pay Supplier".

## Phase 4 — Customers ledger, Expenses, Day book
- Customer ledger (Debit/Credit, running balance), "Receive Payment", statement print/PDF.
- Expenses (categories, payment method, receipt photo).
- Cash day book: opening cash, sab cash in/out, expected closing.

## Phase 5 — Inventory + Reports + POS Dashboard
- Stock ledger, adjustment (damage/in/out), opening stock, low/out-of-stock alerts, stock value.
- Reports: sales (din/hafta/mahina/custom), purchase, P&L, gross profit, expenses, stock, outstanding, cash flow, payment method, returns, best-selling, category/customer/staff wise. Filters + PDF/CSV/Print.
- POS dashboard: aaj ki sale/purchase/profit, udhaar, payable, stock value, low stock, recent bills/payments, cash balance.

## Phase 6 — Staff roles, permissions, settings
- Roles: Admin, Manager, Cashier, Salesman, Staff; har permission (price edit, discount, cancel, reports, profit, stock, users...) — database level par bhi enforce.
- Sensitive kaam par PIN.
- POS Settings: tax, decimals, invoice template/terms, receipt, barcode, low-stock threshold, backup export.
- Cancel = status "Cancelled", kuch delete nahi hota; sab audit log me.

## Testing (har phase ke baad)
Asli database par: sale, multi-product, discount, cash, udhaar, payment receive, return, stock check, purchase, supplier payment, expense, statement, reports, print/PDF, permissions, reload, mobile, aur Vyapar sync check.

## Technical details
- New tables with workspace_id + RLS via `current_workspace()`, GRANTs, `created_by`.
- `pos_complete_sale`, `pos_create_return`, `pos_create_purchase`, `pos_receive_payment`, `pos_pay_supplier`, `pos_adjust_stock` as SECURITY INVOKER plpgsql RPCs (atomic), stock changes only via `stock_movements` inserts updating `products.stock`.
- Customer/supplier balances computed from ledger (no drift); reports via SQL views/RPCs.
- Roles: extend `app_role` enum + `role_permissions` table + `has_permission()` definer fn.
- Offline desktop app: phase 1–2 local support; baqi modules online-only unless requested.
- POS route split into sub-routes (`/pos`, `/pos/returns`, `/pos/purchases`, `/pos/parties`, `/pos/expenses`, `/pos/reports`, `/pos/stock`, `/pos/settings`).

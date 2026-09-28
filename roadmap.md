# Roadmap — Vyapar-style POS
- [ ] Printing templates: individual invoice field font sizes and whole-invoice font style
- [x] Match POS billing page to the supplied full-width sale-invoice layout without changing billing behavior
- [x] Phase 1–6: POS business system
- [x] Production audit: idempotency, change/overpayment fix, return/cancel guards, locked direct writes, indexes, friendly errors
- [ ] Optional: server-side price-edit check (needs per-unit pricing rules on server)
- [x] Block sale on insufficient stock — now a setting (Inventory > negative stock)
- [x] Printing & Settings: central print engine (A4/A5/58/80/custom), settings hub, printers, POS/purchase/return/statement/receipt/expense/day book printing, offline + desktop printer bridge
- [x] Advanced Accounting: COA, journals, auto-posting, GL, TB, P&L, BS, AR/AP, dashboard, periods, permissions
- [x] Sale Return: optional original bill, POS product dropdown and staged entry, atomic bill-free refund/stock posting

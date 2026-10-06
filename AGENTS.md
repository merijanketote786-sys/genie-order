<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep POS product search and staged field editing in the invoice table's entry row, aligned to the invoice columns; this makes keyboard entry and the bill a single continuous workflow.
- Save bill-free sales returns through a dedicated permission-checked atomic database function; this keeps linked returns' invoice quantity limits intact while posting stock, refund, and accounting records together.

- POS stock is tracked per store in pos_store_stock (products.stock stays the total); the browser sends the selected store as x-pos-store and database stock moves use it, so existing sale/purchase/return functions work unchanged.
- Billing entry strips use the shared `entry-bar` / `entry-add` utilities in src/styles.css instead of per-screen background classes; this keeps the most-used row on every POS billing screen visually identical and clearly the primary control.
- Invoice typography overrides live in POS printing config and are applied in the shared HTML print renderer; this keeps preview, print, and PDF consistent without changing historical transaction data.
- Custom invoice charges are opt-in per field, stored in each sale payload, and included in the saved grand total; this preserves reprints and all downstream balances/accounting.
- “All stores” is a read-only combined-stock view; stock-moving actions require one concrete store so inventory remains attributable and atomic.
- Manufacturing runs through the atomic pos_manufacture database function (per-store stock check, raw-material out + finished-goods in, unit cost set as purchase price); this keeps stock moves attributable and consistent.
- Render the shared POS navigation in AppShell's dedicated POS sidebar rather than per-page strips; this keeps every POS screen's links consistent across desktop and mobile.
- Render Parties transaction actions through the shared portal dropdown and use compact transaction rows on phones; this prevents clipping inside scroll areas while keeping ledger amounts readable.
- Keep historical sales and purchase party IDs in their existing records, and present same-phone contacts together in POS; this preserves transaction links and balances without destructive data migration.
- POS party selectors must request only POS-scoped customers, while Workspace customer selectors retain their existing full list; this prevents Workspace-only contacts from appearing in POS workflows.
- POS units (main/sub with conversion factor = sub units per 1 main) and saved categories live in pos_units / pos_categories, written via the browser client under RLS (edit_stock or admin); keeps them workspace-scoped without new RPCs.
- Dashboard quick-action popups render route components directly inside EmbeddedShell (AppShell renders children only) instead of iframes; nested iframes lose the preview auth session.

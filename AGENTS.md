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

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
- Handle rotation with shared AppShell/dialog safe-area and short-landscape CSS rather than orientation listeners or remounts, so in-progress entries survive viewport changes.
- Workspace order/invoice/confirmation formatting, extract and rate imports are rule-based (src/lib/template-engine.ts + per-user order_templates kinds incl. *_input); no AI calls anywhere in the app, so they work without credits and stay predictable.

- POS writes (sales, purchases, returns) go through runOrQueue in src/lib/offline-sync.ts: offline saves queue in IndexedDB with a per-device number prefix and replay via the same server functions using clientRef idempotency; query cache persists to IndexedDB and a guarded service worker (published site only) caches the app shell.
- Fixed assets use a POS-only register with workspace-scoped RLS, edit_stock writes, subscription guards and UUID upserts; register changes do not post inventory, payments or accounting journals.
- POS D-O conversion and customer-output filtering live in the shared print helper and apply to preview, print, PDF and sharing; source invoices and global customer print settings remain unchanged.
- POS saves use additive pos_save_doc_v3: quotation edits update the existing estimate atomically, conversion derives the invoice number from the source in the database, and other writes delegate to pos_save_sale; prior versions remain for deployed callers. pos_delete_doc_v2 checks active POS sales permission and writes audit entries directly without the restricted print-event logger.
- POS party details are edited by existing customer/supplier IDs through the invoker-rights atomic pos_edit_party_details function; combined parties update both records together without changing historical links or balances.
- POS purchase orders live in public.purchases as doc_type 'order' with status open/converted: pos_save_purchase_order writes no stock/payment/accounting, pos_convert_purchase_order locks the order, creates the linked purchase (ref_order_id, PUR- prefix) and marks it converted, and pos_cancel_purchase_order only touches open orders — keeping stock, balances and journals consistent with the existing purchase flow.
- Purchase financial reports query only purchase/return documents; purchase saves share UI store/credit-party guards, and order conversion enforces them server-side and atomically in the database so orders cannot affect balances or bypass read-only store mode.
- Bulk update rate maths (percentage over purchase price) lives in the pure src/lib/bulk-pricing.ts helper and is gated by the "Rate by %" master switch; keeping the rule out of the component makes the on/off behaviour testable without rendering the grid.
- Expenses carry an optional store_id (validated to the same workspace by trigger); moving an expense between stores only changes store_id and writes audit, never accounting, so journals stay untouched.
- Multi-firm: each firm is its own workspace (pos_firms maps firm → owner and root); switching updates the owner's profiles.workspace_id via pos_switch_firm and fully reloads the app after clearing the device cache, and subscriptions resolve through firm_root so child firms follow the owner's plan. Staff stay in the one firm they were added in. Firm PIN locks (bcrypt in pos_firms.pin_hash, set via pos_set_firm_pin) are enforced inside pos_switch_firm so the check cannot be bypassed from the client. Cross-firm stock transfer (pos_transfer_firm_stock) requires the caller to own both firms, moves per-store stock and products.stock, and auto-creates the matching product in the target firm by normalized_name.
- Module visibility uses the shared route classifier and effective subscription/user markers; ModuleAccessGate wraps the authenticated outlet before pages mount, with live invalidation and polling fallback so revocations redirect existing sessions as well as direct links.
- Use the database's is_platform_owner check for owner UI and server permissions, requiring authenticated identity plus the protected admin role; shared checks prevent staff privilege exemptions and inconsistent admin menus.
- POS Guide matches free-text questions to a local curated FAQ catalog, filtering disabled-module topics before matching; it never calls AI or fabricates missing answers. POS Admin links reuse the existing panel authorization and preserve POS shell context through a validated search parameter.

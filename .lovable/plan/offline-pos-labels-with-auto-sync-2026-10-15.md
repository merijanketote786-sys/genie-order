# Offline POS + Labels with auto sync

## What the user gets
- POS billing (sale, estimate, purchase, return) and Labels work with no internet.
- Each device gets its own bill prefix (e.g. A-0001, B-0001) set once in Settings, so offline bills never clash.
- When internet returns, queued bills upload automatically; other devices/users see them after their next refresh.
- A small status badge in the top bar: "Offline — N bills waiting" / "Syncing…" / "Synced".
- Stock can go negative offline (same rule as today, shown red).

## Phases
1. App opens offline: guarded service worker (published site only, never in preview) caches the app screens.
2. Local copy of data: products, parties, stores, units, categories, settings, label settings saved on the device and refreshed whenever online. POS and Labels read from this copy when offline.
3. Offline queue: new bills/purchases/returns/label prints saved on the device with device-prefixed number; on reconnect they are sent one by one through the existing save functions (same stock, party balance and accounting posting). Failed items stay in the queue with a visible error and Retry.
4. Device prefix setting + status badge + "Sync now" button.
5. Test: go offline in browser, make bills, come online, confirm they appear on another signed-in session with correct stock and balances.

## Limits (told to user)
- Login needs internet the first time on each device; after that the session is kept.
- Editing/deleting old bills, reports, Day Book, accounts and Workspace stay online-only.
- Offline only works in the published/installed app, not the editor preview.

## Technical details
- vite-plugin-pwa generateSW, registration wrapper with preview/iframe guards, NetworkFirst navigations, /~oauth excluded.
- IndexedDB store (idb-keyval) for snapshot + outbox; React Query reads fall back to snapshot when navigator is offline.
- Sync replays outbox via existing createServerFn save calls with a client-generated idempotency id stored in the payload to avoid double posting on retry; server checks it before inserting.
- Device prefix kept per device; invoice number passed in payload when created offline.

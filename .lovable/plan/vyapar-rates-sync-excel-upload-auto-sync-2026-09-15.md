# Vyapar Rates Sync — Excel Upload + Auto Sync

Rates section ko Vyapar se jorna hai. Vyapar koi online connection nahi deta, sirf Excel export deta hai — is liye do raste banayenge: (1) app ke andar Excel upload, (2) aapke computer par chalne wala chhota auto-sync program.

## 1. Rates page par "Vyapar Excel upload" (sab staff ke liye)

- Rates page par ek naya upload card: file choose karein (.xlsx / .xls / .csv), phir "Rates update karein".
- Upload hotay hi saaf natija dikhega: kitne naye products aaye, kitne update hue, kitne skip hue, aur kaunsi rows me masla tha.
- Upload ke baad rate list foran refresh ho jayegi.
- Product ke naam se match hoga (wohi normalize rule jo abhi chal raha hai) — purana product kabhi delete nahi hoga, sirf update hoga.
- Aapki apni customize ki hui prices ko upload kabhi overwrite nahi karega (jaise abhi hai).
- Staff prices (100g / 250g / 500g) wahi maujooda rules se khud ban jayengi — koi hisaab nahi badlega.

### Column pehchan
Vyapar export ki sheet ke headers khud pehchane jayenge (Item Name / Name, Sale Price / Sales Price / Rate, Unit, Stock / Closing Stock / Quantity). Agar koi zaroori column na mile to saaf message aayega ke kaunsa column nahi mila, upload rad ho jayega — adhoora data kabhi save nahi hoga.

## 2. Computer par auto-sync program

- Ek chhoti Windows script di jayegi (project me `tools/vyapar-sync/` folder + parhne me asaan hidayat).
- Woh ek folder par nazar rakhegi jahan aap Vyapar se export karte hain; nayi file aatay hi rates app par chali jayengi.
- Windows Task Scheduler se har ghante ya din me ek baar bhi chala sakte hain.
- Yeh wohi mehfooz sync raasta istemal karegi jo pehle se bana hua hai (secret key ke saath) — key sirf aapke computer par rahegi.

## 3. Sync status

- Rates page ke admin view me last sync ka waqt aur counts pehle se dikhte hain — ab upload se hone wale sync bhi wahin nazar aayenge.

## Technical notes

- New server function `syncProductsFromSheet` (`src/lib/products.functions.ts`): accepts parsed rows, header auto-detect + normalization, delegates to shared upsert path in `src/lib/product-sync.server.ts` (refactor `handleProductSync` so the upsert/logging core is reusable by both the HTTP route and the server fn). Never deletes; upsert on `normalized_name`; writes a `sync_logs` row with source.
- Sheet parsing: SheetJS (`xlsx`) — pure JS, Worker-safe. Parse inside the server function handler from a base64/array payload; 10MB limit, max 5000 rows.
- `src/routes/rates.tsx`: new `VyaparUploadCard` component (file input, progress, result summary, error list), invalidates the products query on success. No change to search, pricing display, or custom-price editing.
- Pricing stays entirely in the existing `products_apply_pricing()` DB trigger — untouched.
- Existing `/api/sync/products` and `/api/public/sync/products` endpoints stay exactly as they are.
- Auto-sync script: PowerShell in `tools/vyapar-sync/` reading the Excel via COM/CSV export and POSTing JSON to `/api/public/sync/products` with `x-api-key`; README with setup steps. Key never stored in the app or frontend.

## Verification

- Sample Vyapar-style sheet upload karke counts check, rate list refresh, custom prices intact, pricing rules (kg/litre 100g-250g-500g, grammes, pcs) unchanged.
- Bina valid columns wali file par saaf error, koi data change nahi.

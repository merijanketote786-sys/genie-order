# Rates data ab har account ka apna

Abhi Vyapar se aayi hui saari products har signed-in user ko nazar aati hain. Isay badal kar har account ko apni alag rate list di jayegi.

## Kya hoga

- **hhtraders008@gmail.com** aur **merijanketote786@gmail.com** — dono ko mojooda Vyapar wali poori rate list milegi (aik hi shared list, dono ek doosre ki tabdeeli dekhenge).
- **Admin sirf hhtraders008@gmail.com** rahega (dusra email normal team member).
- **Baqi har user** ko Rates page bilkul khali milega — "abhi koi product nahi, apni rate list add karein" wali halat. Wo khud Excel/CSV upload, paste, ya PDF/tasveer se apni products daal sakta hai; unka data sirf unhein dikhega.
- Invoice banate waqt jo rates khud lagte hain, wo bhi usi user ki apni list se aayenge.
- Sync page ka status (kitni products, aakhri sync) bhi har user ka apna.
- Vyapar ka auto-sync (setup file / API key) purani hi jagah — yani HB wali shared list — update karta rahega.
- Rate calculation ke rules (100g / 250g / 500g, custom prices), order, history, invoices, customers — kuch nahi badlega.

## Technical details

**Migration**
- `products` me `workspace_id uuid not null` add; `sync_logs` me bhi `workspace_id uuid`.
- Mojooda tamam products aur logs ka `workspace_id` = hhtraders008 wale user ka `auth.users.id` (HB workspace).
- `products` ka unique constraint `normalized_name` se badal kar `(workspace_id, normalized_name)`; indexes update.
- `profiles` me `workspace_id uuid` column; default = user ka apna id (trigger `handle_new_user` me set), aur merijanketote786 ki row ka workspace HB workspace par set.
- Helper `public.current_workspace(_user_id uuid)` (SECURITY DEFINER, stable) jo `profiles.workspace_id` (warna user id) return kare.
- RLS status waisa hi (products/sync_logs sirf service_role se padhe jaate hain); grants na badlein.

**Server code (sab jagah workspace filter)**
- `src/lib/products.functions.ts`: `getProducts`, `saveProductPrices`, `saveProductPricesBulk`, `getSyncStatus` me pehle workspace resolve karke `.eq("workspace_id", ws)` lagayein; sync/apply functions workspace pass karein.
- `src/lib/product-sync.server.ts`: `syncProductRows(products, workspaceId)` — existing lookup, upsert (`onConflict: "workspace_id,normalized_name"`) aur `sync_logs` insert me workspace shamil. `handleProductSync` (API key wala public endpoint) HB workspace istemal karega (env/lookup se admin email ka id).
- `src/routes/api/invoice.ts`: `buildRateContext` ko workspace chahiye — client request me Authorization bearer bhejna, server par `supabase.auth.getUser()` se user nikaal kar uska workspace filter; user na mile to koi rate list attach na ho.
- `src/routes/_authenticated/rates.tsx`: khali list par polished empty state — "Abhi koi product nahi. Sync page se apni rate list add karein."

**Test**
- Admin account: poori list dikhe, edit/save chale.
- Dusra email: wohi list dikhe.
- Teesra (naya) account: Rates khali, apni CSV upload karne par sirf usay dikhe, admin ki list par asar na ho.

# Packing (bottles) ka stock aur bill par apne aap minus hona

## Ye kaise kaam karega
1. **Bottle ko item banayen** — Items mein "Bottle 500ml" jaisa ek item banayen (unit: piece). 1200 bottles aayen to Purchase mein normal entry karein; stock 1200 dikhega, store ke hisaab se.
2. **Item ke saath packing link karein** — Har chemical item ke form mein naya hissa "Packing": bottle chunein aur likhein kitni bottle per unit (jaise 1 kg = 2 bottle 500ml, ya 1 piece = 1 bottle). Ek item ke saath ek se zyada packing ho sakti hai (bottle + cap + label).
3. **Bill par apne aap minus** — Invoice save hote hi chemical ke saath us ki packing bhi usi store se minus hogi: qty × bottle per unit (aadhi bottle upar round hogi, jaise 2.5 kg × 2 = 5 bottle).
4. **Wapsi aur cancel** — Bill cancel ya sales return par packing wapas stock mein aayegi. Estimate aur D-O par packing minus nahi hogi.
5. **Hisaab** — Stock movements mein "Packing for INV-xxxx" likha nazar aayega; bottle ki purchase price item ki cost mein shamil hogi taake munafa sahi dikhe.

## Hadood
- "All stores" mein bill pehle ki tarah nahi banega; packing usi store se nikalegi jo chuna hai.
- Purane bills par koi tabdeeli nahi hogi.
- Bottle kam ho to bhi bill nahi rukega (stock minus mein chala jayega), jaise abhi chemical ke saath hota hai.

## Technical details
- Additive table `pos_packing_links(workspace_id, product_id, packing_product_id, qty_per_unit)` with GRANTs, RLS (workspace-scoped read, edit_stock/admin write).
- Additive DB function `pos_apply_packing(_sale uuid, _sign int)` called from the existing sale save, cancel and return paths via a new v-next wrapper (old versions kept). Uses `pos_move_stock` with kind `packing_out` / `packing_in`, ref = sale id, ceil rounding.
- Line `cost` includes packing cost (packing purchase_price × qty) so profit reports stay correct; no separate accounting journal (inventory already handled by sale cost).
- Product form UI: packing rows with item dropdown + qty-per-unit; offline cache includes links so queued bills apply packing on replay.
- Tests: 1 kg × 2 bottles → 5 bottles for 2.5 kg; cancel restores; quotation does not deduct.

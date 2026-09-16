# Order history, Customers aur Invoice record

Order aur Invoice dono sections ka permanent record banega. Record poori team ka shared hoga — har staff sab kuch dekh sakega, aur admin ke paas delete/edit ka ikhtiyar hoga.

## 1. Order history

- Jab bhi Order section se format ban kar aata hai, ek "Save order" button milega (auto-save bhi hoga jaise hi order banta hai, taake koi record na chhoote).
- Nayi page: **History** (bayen menu mein), jahan saare orders list mein honge — sab se naya upar.
- Har row: order number, customer ka naam, phone, city, products, total, kis ne banaya, date/time.
- Upar search box: naam, phone, ya product se dhoondein.
- Row kholne par poora formatted order — Copy, WhatsApp bhejo, aur "Dobara edit karein" (order chat mein wapas load ho jata hai).
- Sirf admin kisi order ko delete kar sakta hai.

## 2. Customers

- Har save hue order se customer khud-ba-khud record ho jata hai (phone number pehchan ka zariya).
- **Customers** page: naam, phone, city, address, kitne orders, aakhri order ki tareekh, total kharch.
- Order ya Invoice box mein phone/naam likhte hi purana customer suggest hoga — ek click par uska naam, city aur address bhar jayega.
- Customer kholne par uske saare purane orders aur invoices.

## 3. Invoice record + status

- Har invoice apne khud ke number ke saath save hogi (misal: INV-2609-0042), dobara wahi number use nahi hoga.
- **Invoices** page: number, customer, phone, total, status badge, tareekh, kis ne banayi.
- Status: **Unpaid / Partial / Paid** — ek click se badal jaye; paid karte waqt tareekh bhi record hogi.
- Har invoice se dobara PDF/Excel download aur WhatsApp bhejna — bina invoice dobara banaye.
- Upar chhoti summary: is mahine ki total invoice value, paid, aur baqaya raqam.
- Sirf admin delete kar sakta hai.

## 4. Chhoti behtariyan isi kaam ke saath

- Order aur Invoice page par "Recent" ki patti — aakhri 5 records, ek click par khul jayen.
- Customer ke phone se WhatsApp bhejne wala maujooda tareeqa waise hi rahega.

## Technical notes

- Naye tables (Lovable Cloud): `orders`, `customers`, `invoices`. Sab par RLS — signed-in active users read/insert/update, delete sirf `has_role(auth.uid(),'admin')`. `created_by` column har row par; `GRANT` statements migration mein shaamil.
- `customers` par `phone` unique; order save par upsert (naam/city/address tabhi update jab nayi value mile).
- Invoice number: `invoice_seq` sequence + SQL function `next_invoice_number()` (format `INV-YYMM-####`), taake duplicate na ho.
- Server functions `src/lib/orders.functions.ts` aur `src/lib/invoices.functions.ts` mein, `requireSupabaseAuth` + `isActiveProfile` check ke saath (maujooda `products.functions.ts` wala pattern).
- Naye routes: `src/routes/_authenticated/history.tsx`, `customers.tsx`, `invoices.tsx`; `app-shell.tsx` ke TABS mein add.
- Save hone wala data = plain formatted text + parse ki hui fields (`src/lib/invoice-export.ts` ka `parseInvoiceText()` aur order text ke liye isi tarz ka chhota parser) — AI prompts, pricing trigger, PDF layout, WhatsApp logic bilkul nahi badlenge.
- Maujooda localStorage chat history waise hi chalti rahegi; DB record uske alawa hai.

## Is plan mein shaamil nahi

Dashboard stats, stock alerts, voice input, offline mode — baad mein alag se ho sakte hain.

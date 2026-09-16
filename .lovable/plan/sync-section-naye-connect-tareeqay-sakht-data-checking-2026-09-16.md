# Sync section: naye connect tareeqay + sakht data checking

Abhi Sync page par do tareeqay hain: setup file (auto folder watch) aur manual Excel/CSV upload. Iske sath teen aur tareeqay add honge, aur har tareeqe ka data ussi ek hi rule se guzar kar hi database me jayega.

## 1. Drag & drop + clipboard paste

Upload card ko behtar karenge:

- File ko card par drag kar ke chhorna kaafi hoga (highlight border ke sath).
- Ctrl+V se copy ki hui file (Excel, CSV, PDF, screenshot) seedha attach ho jayegi.
- Ghalat type ki file gire to foran laal error: "Ye file type support nahi — sirf Excel, CSV, PDF ya image."

## 2. Table seedha paste karna (kisi bhi software se)

Naya "Rate list paste karein" box:

- Kisi bhi software (Vyapar, Excel, Google Sheets, kisi bhi list) se rows copy kar ke box me paste karein.
- Tab, comma ya pipe se alag columns khud pehchan liye jayenge.
- Pehli line ke column naam (Item Name, Sale Price, Unit, Stock) usi mojooda pehchan wale system se milaye jayenge.

## 3. PDF / tasveer se rate list padhna

- PDF ya image upload/paste karne par app usme se item, rate, unit aur stock nikalega (wahi reading engine jo Extract page me chal raha hai).
- Nikala hua data seedha save nahi hoga — pehle screen par table dikhega, aap "Confirm karke update karein" dabayenge tab jayega.
- Kuch samajh na aaye to error: "PDF me rate list ka table nahi mila."

## 4. Doosre software ke liye direct connection (sirf admin)

Ek "Kisi bhi software se connect karein" card, admin ko dikhega:

- Ready endpoint address, copy button, aur sample data ka namuna.
- Sync key sirf "Show / Copy" par zahir hogi (screen par by default chhupi).
- Sath me ek ready-made CSV/Excel template download, taake doosra user apni file sahi columns me bana sake.

## 5. Sakht checking — ghalat data bilkul add nahi hoga

Har tareeqe (upload, paste, drag, PDF, API) ka data ek hi checking se guzrega. Agar file/rows sahi nahi to **kuch bhi save nahi hoga** aur upar surkh box me wajah likhi hogi, jaise:

- "Ye file type support nahi (sirf .xlsx, .xls, .csv, .pdf, image)."
- "File 10MB se bari hai."
- "Item Name ka column nahi mila."
- "Sale Price (rate) ka column nahi mila — Vyapar se Item Details export karein."
- "Rate aur naam ek hi column me hain — file theek nahi."
- "Rate 0 ya khali hai — 24 rows chhori gayin" (purane rate safe rahenge).
- "5000 se zyada rows hain."

Report me: kitni rows aayin, kitni nayi, kitni update, kitni chhori gayin aur kyun (pehli 10 misalein naam ke sath).

## Jo bilkul nahi badlega

- Rate ka hisaab (100g / 250g / 500g wale rules) waise hi database me.
- Custom prices kabhi overwrite nahi hongi, koi product delete nahi hoga.
- Mojooda setup-file auto sync, manual upload, aur mojooda endpoint sab waise hi chalte rahenge.

## Technical notes

- `src/lib/vyapar-sheet.server.ts`: naya `parseDelimitedText()` (tab/comma/pipe) aur `parseRateRows()` — mojooda header-detect, unit map aur price>0 rules reuse honge; errors typed reasons ke sath (`code` + Roman Urdu message) return honge, sirf pehla message nahi.
- `src/lib/products.functions.ts`: `syncProductsFromText` (paste), `previewProductsFromDocument` (PDF/image → rows, AI gateway `google/gemini-3-flash-preview` wahi jo `api/extract.ts` use karta hai) aur `applyProductRows` (confirm ke baad) — sab `requireSupabaseAuth` + `isActiveProfile` ke peeche; PDF/image aur template/API card admin-only.
- `src/components/vyapar-sync.tsx`: `VyaparUploadCard` me drag/drop + paste handlers, naya `PasteRatesCard`, `DocumentImportCard` (preview table + confirm), `ConnectApiCard` (masked key + copy + template download). Shared `<SyncResultReport>` component saare tareeqon ke liye.
- Sab raste aakhir me mojooda `syncProductRows()` (`product-sync.server.ts`) ko hi call karenge — validation aur logging aik hi jagah.
- File limits: 10MB, 5000 rows; unsupported MIME/extension client aur server dono jagah rad.

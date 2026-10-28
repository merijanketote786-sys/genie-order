# POS ka naya look — Deep Teal theme

## Kya badlega
- **Rang (Deep Teal):** gehra teal sidebar/header, chamakdar teal buttons aur links, halka mint background, amber (sunehri-narangi) highlights jaise totals, warnings aur khaas badges.
- **Light + Dark dono:** pehle se maujood light/dark toggle chalta rahega; dono modes ke rang naye teal palette mein, achhe contrast ke saath.
- **Fonts:** headings ke liye "Space Grotesk", baqi text ke liye "DM Sans" — saaf aur jadeed, numbers aasaani se parhne wale.
- **Poora look:** thode gol kone, naram shadows, cards par patli border, buttons par halka gradient aur hover glow, sidebar mein active item ke liye teal pill, inputs par teal focus ring.
- Billing entry row (entry-bar) naye rang mein bhi sab se numayan control rahegi.

## Kya nahi badlega
- Koi feature, hisaab, data ya screen layout nahi badlega.
- Invoice print/PDF ke rang aur fonts waise hi rahenge (sirf screen ka look badlega).
- Mobile/tablet rotation support waisa hi rahega.

## Technical details
- `src/styles.css`: `:root` aur `.dark` ke tamam oklch tokens (background, primary, accent, sidebar, gold→amber, success/warning, chart-1..5, entry-bar) nayi teal palette se replace; `--radius`, shadow aur gradient tokens add/update.
- `src/routes/__root.tsx`: Google Fonts link ko Space Grotesk + DM Sans par switch; `--font-display` / `--font-sans` update.
- `src/components/ui/button.tsx`, card, input: variants mein gradient/shadow/focus tokens.
- Components mein hardcoded rang classes (`bg-white`, `text-slate-*` waghera) `rg` se dhoond kar semantic tokens par shift.
- Design choice memory mein save (mem://design/theme).
- Verify: phone (440px) aur desktop par light/dark screenshots — dashboard, billing, reports.

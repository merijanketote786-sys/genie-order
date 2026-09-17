# Mobile-first compact workspace redesign

## Goal
Give the whole OrderBot workspace a wider, calmer overview on mobile. Keep the main task visible, replace bulky secondary sections with small labeled icons, and open those tools in focused popup sheets without removing any functionality or changing saved data.

## What will change

### 1. Shared workspace frame
- Keep the selected Premium Navy palette and switch typography to Sora headings with Manrope body text.
- Replace the long horizontal mobile navigation row with a compact bottom dock for primary destinations and a “More” icon that opens the complete section grid.
- Compress the mobile top bar to brand, current page, refresh, theme, and account actions without horizontal overflow.
- Keep the desktop sidebar, but reduce its visual density and align it with the selected minimalist direction.
- Make page headings shorter on mobile; supporting descriptions and tags remain available on larger screens.

### 2. Order and Invoice workspaces
- Preserve the chat/composer as the dominant open work area.
- Replace always-visible Customer, Courier, Payment, and Template sections with a compact icon tool dock.
- Open each tool in a mobile bottom sheet and a centered popup on larger screens.
- Keep current behavior intact: selected customer insertion, delivery calculation insertion, COD/CC replacement rules, template editing, invoice phone, chat history, and automatic saving.
- Show small active indicators on tool icons when a customer-related value, payment mode, or custom template is active.

### 3. Remaining sections
- Extract: compact the attachment controls around the main text area; file details appear only when needed.
- Rates: keep search primary; move Price Customize, Bulk Edit, and sync status into compact mode/action controls.
- Sync: turn each sync method into a small icon tile that opens its existing form in a popup; status remains immediately visible.
- Calculator: group service, zone, packaging, COD, and breakdown into focused collapsible/popup areas while keeping weight and cities prominent.
- History, Invoices, Customers: keep searches visible; open row details/actions in sheets instead of expanding long cards inline on mobile.
- Admin: show dashboard summary first and use icon tabs/popups for Users, Export, and Records so wide tables do not dominate mobile.

### 4. Reusable mobile interaction
- Add one reusable responsive tool-sheet and one compact icon-action component using existing interface controls.
- Use clear icons plus short labels, 44px minimum touch targets, safe-area spacing, scroll locking, and visible close controls.
- Use restrained transitions and respect reduced-motion preferences.

## Technical details
- Frontend presentation only; database rules, APIs, calculations, permissions, saved chat history, templates, orders, invoices, and customers remain unchanged.
- Use semantic design tokens in `src/styles.css`; no page-level hardcoded colors.
- Load Sora and Manrope through document head links.
- Reuse the existing dialog system and Button component, adapting dialogs to bottom sheets on small screens.
- Verify authenticated owner and regular-user paths at 440px mobile and desktop widths, including popup open/close, navigation, composer insertion, calculator totals, lists, and admin access.

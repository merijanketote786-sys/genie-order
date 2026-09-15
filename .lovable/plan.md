# Custom Order Template

## Goal
Har signed-in user Order section mein apni formatting template save kar sake, aur agla order usi saved format mein bane. Default template tab tak bilkul wahi rahegi jab tak user custom template save na kare.

## Changes
- Order page par **Template** control add hoga, jahan user field labels aur line order apni marzi se likh sakega.
- Current template pehle se editor mein nazar aayegi; **Save template** aur **Reset to default** actions honge.
- Template har user ke account ke saath database mein alag save hogi, is liye doosre users ki template nazar ya apply nahi hogi.
- Order formatting request saved template ko use karegi; existing Urdu/Roman Urdu/English parsing, phone cleanup, quantity, CC/COD aur status rules preserved rahenge.
- Loading, save confirmation, validation, aur clear error states add honge; mobile par editor full-width aur touch-friendly hoga.

## Technical Details
- New user-owned `order_templates` table with explicit grants, RLS, and owner-only select/insert/update/delete policies.
- Authenticated server functions template load/save/reset ke liye, validated length and required content ke saath.
- Existing `/api/chat` endpoint body mein selected template receive karega and safely combine karega with fixed business rules; endpoint path aur streaming behavior unchanged rahega.
- Existing chat history and all current Order actions remain unchanged.

## Verification
- Do alag users ki templates isolated hon.
- Default template, custom template, reset, reload persistence, and order generation test hon.
- Desktop aur mobile layouts, loading/error states, console, and existing Order behavior verify ho.

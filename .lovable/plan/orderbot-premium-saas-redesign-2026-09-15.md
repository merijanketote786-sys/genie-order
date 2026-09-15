# OrderBot Premium SaaS Redesign

## Goal
Redesign the existing four-module application as a premium HB Chemicals Pakistan operations dashboard without changing routes, APIs, calculations, stored data, or existing actions.

## Scope
- Audit Order, Invoice, Extract, and Rates screens plus shared navigation and result controls.
- Create a responsive desktop sidebar and compact mobile navigation using the existing logo and brand.
- Restyle each existing workflow around its real controls and data; do not introduce courier fields or dashboard pages that do not exist.
- Preserve chat history, custom price editing, sync status, file extraction, invoice amendments, customer WhatsApp sharing, theme switching, and all API behavior.
- Add polished loading, empty, error, focus, and disabled states using the existing component system.

## Visual Direction
- Deep navy primary, professional blue accent, off-white canvas, white surfaces, charcoal text, slate secondary text, green success, amber warning, and restrained red errors.
- Plus Jakarta Sans for interface typography and JetBrains Mono for formatted documents and numeric details.
- Compact operations-focused shell, subtle borders, soft shadows, 12–16px surface radii, generous spacing, and minimal motion.

## Page Treatment
- **Order:** large order-entry workspace, professional formatted-order output, prominent Copy and WhatsApp actions.
- **Invoice:** customer phone and prompt configuration followed by a commercial-document preview and existing actions.
- **Extract:** clear upload-to-processing-to-result flow with supported file constraints and copy/share actions.
- **Rates:** retain the real product-rate search and price customization experience; present it as a professional internal pricing workspace rather than inventing courier calculations.

## Verification
- Test all four routes on desktop and mobile.
- Exercise existing actions and API-backed flows without altering their logic.
- Check keyboard focus, labels, contrast, overflow, broken links, console errors, and network failures.

## Technical Details
- Keep TanStack route paths and endpoint URLs unchanged.
- Reuse existing components where possible; refactor shared presentation into focused components only where needed.
- Apply semantic design tokens in the global stylesheet and shadcn controls for interaction states.
- Preserve local storage keys, database reads/writes, pricing rules, prompts, and result parsing.

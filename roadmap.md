# Roadmap

- [x] Mobile login header: subscription plan pills + Plans button visible on phones (plans must exist to show; list currently empty).
- [x] Login footer renamed from "© HB Chemicals Pakistan" to "© HB POS".
- [x] Monitoring: AI chat/invoice "Forbidden" errors — dead Workspace-era AI routes already removed; deleted unused src/lib/ai-gateway.server.ts, src/components/lightweight-chat.tsx, src/components/ai-elements/, and the unused `ai` / `@ai-sdk/*` packages.
- [x] Monitoring: SSR 500s (superCtor TypeError) — xlsx server helpers now use the Worker-safe `xlsx/dist/xlsx.core.min.js` bundle; imports were already lazy.
- [ ] User: add real subscription plans in Super Admin → Plans tab (no prices may be invented; header shows them once added).

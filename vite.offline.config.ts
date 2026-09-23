/**
 * Desktop (offline) build. Sara data localStorage me rehta hai aur koi server call nahi hoti.
 * Build: bunx vite build --config vite.offline.config.ts
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

const src = fileURLToPath(new URL("./src", import.meta.url));
const at = (p: string) => `${src}/${p}`;

export default defineConfig({
  root: at("offline"),
  base: "./",
  publicDir: fileURLToPath(new URL("./public", import.meta.url)),
  plugins: [react(), tailwindcss()],
  define: {
    "process.env": "{}",
    "import.meta.env.VITE_OFFLINE": JSON.stringify("1"),
  },
  resolve: {
    alias: [
      // Server-backed data layer -> local (localStorage) versions
      { find: /^@\/lib\/records\.functions$/, replacement: at("offline/records.local.ts") },
      { find: /^@\/lib\/products\.functions$/, replacement: at("offline/products.local.ts") },
      { find: /^@\/lib\/settings\.functions$/, replacement: at("offline/settings.local.ts") },
      { find: /^@\/lib\/order-template\.functions$/, replacement: at("offline/order-template.local.ts") },
      { find: /^@\/lib\/label-settings\.functions$/, replacement: at("offline/label-settings.local.ts") },
      { find: /^@\/lib\/courier-rates\.functions$/, replacement: at("offline/courier-rates.local.ts") },
      { find: /^@\/lib\/dashboard\.functions$/, replacement: at("offline/dashboard.local.ts") },
      { find: /^@\/lib\/admin\.functions$/, replacement: at("offline/admin.local.ts") },
      { find: /^@\/lib\/pos\.functions$/, replacement: at("offline/pos.local.ts") },
      { find: /^@\/lib\/pos-access\.functions$/, replacement: at("offline/pos-access.local.ts") },
      { find: /^@\/lib\/print-admin\.functions$/, replacement: at("offline/print-admin.local.ts") },
      // Auth / server-only modules
      { find: /^@\/integrations\/supabase\/client$/, replacement: at("offline/supabase-client.ts") },
      { find: /^@\/integrations\/supabase\/client\.server$/, replacement: at("offline/server-stub.ts") },
      { find: /^@\/integrations\/supabase\/auth-middleware$/, replacement: at("offline/server-stub.ts") },
      { find: /^@\/integrations\/supabase\/auth-attacher$/, replacement: at("offline/server-stub.ts") },
      { find: /^@\/lib\/[a-z-]+\.server$/, replacement: at("offline/server-stub.ts") },
      { find: /^@tanstack\/react-start$/, replacement: at("offline/react-start-shim.ts") },
      // Start-only root shell -> plain SPA root
      { find: /^\.\/routes\/__root$/, replacement: at("offline/root-route.tsx") },
      { find: "@", replacement: src },
    ],
  },
  build: {
    outDir: fileURLToPath(new URL("./dist-offline", import.meta.url)),
    emptyOutDir: true,
    target: "chrome120",
  },
});

export type ModuleAccess = { pos?: boolean; workspace?: boolean };

const POS_PATHS = new Set([
  "/pos", "/pos-dashboard", "/returns", "/purchases", "/parties", "/suppliers",
  "/ledger", "/expenses", "/attendance", "/daybook", "/inventory", "/fixed-assets",
  "/reports", "/pos-labels", "/pos-invoices", "/accounting", "/pos-settings", "/item-manufacturing",
]);

export function routeModule(pathname: string): "pos" | "workspace" | "shared" {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/admin") return "shared";
  return POS_PATHS.has(path) ? "pos" : "workspace";
}

export function moduleRedirect(pathname: string, access: ModuleAccess): "/pos-dashboard" | "/dashboard" | null {
  const module = routeModule(pathname);
  if (module === "workspace" && access.workspace === false && access.pos !== false) return "/pos-dashboard";
  if (module === "pos" && access.pos === false && access.workspace !== false) return "/dashboard";
  return null;
}

export function applyModuleMarkers<T extends ModuleAccess>(access: T, markers: string[]): T {
  return {
    ...access,
    pos: access.pos !== false && !markers.includes("!pos"),
    workspace: access.workspace !== false && !markers.includes("!ws"),
  };
}
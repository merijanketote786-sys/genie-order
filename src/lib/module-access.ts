export type ModuleAccess = { pos?: boolean; workspace?: boolean };

/** Workspace has been removed: every app page belongs to POS except the shared Admin panel. */
export function routeModule(pathname: string): "pos" | "workspace" | "shared" {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/admin") return "shared";
  return "pos";
}

export function moduleEntryAllowed(pathname: string, access: ModuleAccess): boolean {
  return routeModule(pathname) === "shared" || access.pos !== false;
}

export function moduleRedirect(_pathname: string, _access: ModuleAccess): "/pos-dashboard" | null {
  return null;
}

export function applyModuleMarkers<T extends ModuleAccess>(access: T, markers: string[]): T {
  return {
    ...access,
    pos: access.pos !== false && !markers.includes("!pos"),
    workspace: access.workspace !== false && !markers.includes("!ws"),
  };
}

/** Gate stays open once access data is known; a failed background refetch must not unmount the page. */
export function accessGateReady(hasData: boolean, offline: boolean, fetchedAfterMount: boolean): boolean {
  return hasData && (offline || fetchedAfterMount);
}

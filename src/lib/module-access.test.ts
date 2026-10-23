import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { applyModuleMarkers, moduleRedirect, routeModule } from "./module-access";

describe("Admin module access", () => {
  test("Workspace disabled: root and every Workspace page open POS directly", () => {
    const access = applyModuleMarkers({ pos: true, workspace: true }, ["!ws"]);
    assert.equal(access.workspace, false);
    for (const path of ["/", "/dashboard", "/invoice", "/confirmation", "/extract", "/rates", "/calculator", "/history", "/invoices", "/customers", "/labels", "/sync", "/settings"]) {
      assert.equal(moduleRedirect(path, access), "/pos-dashboard", path);
    }
    assert.equal(moduleRedirect("/pos", access), null);
  });
  test("POS disabled: every POS page opens Workspace directly", () => {
    const access = applyModuleMarkers({ pos: true, workspace: true }, ["!pos"]);
    assert.equal(access.pos, false);
    for (const path of ["/pos", "/pos-dashboard", "/returns", "/purchases", "/parties", "/suppliers", "/ledger", "/expenses", "/attendance", "/daybook", "/inventory", "/fixed-assets", "/reports", "/pos-labels", "/pos-invoices", "/accounting", "/pos-settings", "/item-manufacturing"]) {
      assert.equal(moduleRedirect(path, access), "/dashboard", path);
    }
    assert.equal(moduleRedirect("/", access), null);
  });
  test("markers cannot override subscription restrictions", () => {
    assert.deepEqual(applyModuleMarkers({ pos: false, workspace: true }, []), { pos: false, workspace: true });
    assert.equal(moduleRedirect("/pos", { pos: false, workspace: false }), null);
    assert.equal(moduleRedirect("/invoice", { pos: true, workspace: true }), null);
    assert.equal(routeModule("/pos/"), "pos");
  });
});
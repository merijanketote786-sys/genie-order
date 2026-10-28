import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { accessGateReady, moduleEntryAllowed, moduleRedirect, routeModule } from "./module-access";

describe("POS-only app access", () => {
  test("every page belongs to POS; Admin is shared", () => {
    for (const path of ["/", "/pos", "/pos-dashboard", "/reports", "/sync", "/settings", "/labels"]) assert.equal(routeModule(path), "pos", path);
    assert.equal(routeModule("/admin"), "shared");
  });
  test("Workspace access no longer matters; POS revocation blocks pages", () => {
    assert.equal(moduleEntryAllowed("/pos", { pos: true, workspace: false }), true);
    assert.equal(moduleEntryAllowed("/pos", { pos: false, workspace: true }), false);
    assert.equal(moduleEntryAllowed("/admin", { pos: false }), true);
    assert.equal(moduleRedirect("/pos", { pos: false, workspace: true }), null);
  });
  test("a failed background access check keeps the page mounted once data is known", () => {
    assert.equal(accessGateReady(true, false, true), true);
    assert.equal(accessGateReady(true, true, true), true);
    assert.equal(accessGateReady(false, false, true), false);
  });
});

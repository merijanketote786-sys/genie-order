import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { normalizeStatus } from "./courier-booking.server";

describe("courier status mapping", () => {
  test("delivered", () => assert.equal(normalizeStatus("Delivered to customer"), "delivered"));
  test("undelivered is not delivered", () => assert.notEqual(normalizeStatus("Undelivered - customer not available"), "delivered"));
  test("returned", () => assert.equal(normalizeStatus("Returned to shipper"), "returned"));
  test("out for delivery", () => assert.equal(normalizeStatus("Out For Delivery"), "out_for_delivery"));
  test("in transit", () => assert.equal(normalizeStatus("Arrived at hub"), "in_transit"));
});

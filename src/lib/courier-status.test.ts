import { describe, expect, it } from "vitest";
import { normalizeStatus } from "./courier-booking.server";

describe("courier status mapping", () => {
  it("delivered", () => expect(normalizeStatus("Delivered to customer")).toBe("delivered"));
  it("undelivered is not delivered", () => expect(normalizeStatus("Undelivered - customer not available")).not.toBe("delivered"));
  it("returned", () => expect(normalizeStatus("Returned to shipper")).toBe("returned"));
  it("out for delivery", () => expect(normalizeStatus("Out For Delivery")).toBe("out_for_delivery"));
  it("in transit", () => expect(normalizeStatus("Arrived at hub")).toBe("in_transit"));
});

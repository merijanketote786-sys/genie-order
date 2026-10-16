/** Save actions that may be queued on the device when there is no internet. */
import * as inv from "@/lib/inventory.functions";
import * as rec from "@/lib/records.functions";
import * as biz from "@/lib/business.functions";
import * as pos from "@/lib/pos.functions";
import * as led from "@/lib/ledger.functions";
import * as money from "@/lib/money-accounts.functions";
import * as prod from "@/lib/products.functions";
import * as att from "@/lib/attendance.functions";
import * as stores from "@/lib/stores.functions";
import * as labels from "@/lib/label-settings.functions";
import { saveFixedAsset } from "@/lib/fixed-assets.functions";

const LIST: [unknown, string][] = [
  [saveFixedAsset, "Fixed asset"],
  [inv.updateProductDetails, "Item edit"], [inv.bulkUpdateProducts, "Bulk item update"], [inv.adjustStock, "Stock adjust"], [inv.createPosProduct, "New item"],
  [rec.saveParty, "Party"], [rec.saveOrder, "Order"], [rec.saveInvoice, "Workspace invoice"], [rec.setInvoiceStatus, "Invoice status"],
  [biz.saveSupplier, "Supplier"], [biz.partyPayment, "Party payment"], [biz.receiveSalePayment, "Receive payment"],
  [biz.savePurchase, "Purchase"], [biz.saveSalesReturn, "Sales return"], [biz.saveUnlinkedSalesReturn, "Sales return"],
  [pos.savePosDoc, "Bill"], [pos.closePosDoc, "Bill update"],
  [led.saveExpense, "Expense"], [led.cancelExpense, "Expense cancel"], [led.saveCashEntry, "Day Book entry"], [led.cancelCashEntry, "Day Book cancel"], [led.saveCustomerAccount, "Customer account"],
  [money.saveCashCount, "Cash count"], [prod.saveProductPrices, "Rates"], [prod.saveProductPricesBulk, "Rates"],
  [att.saveLabour, "Labour"], [att.saveDayAttendance, "Attendance"], [att.payLabour, "Labour payment"],
  [stores.transferStock, "Stock transfer"], [labels.saveMyLabelSettings, "Label settings"],
];

let map: Map<string, string> | null = null;
export function queueLabelFor(url: string): string | null {
  if (!map) {
    map = new Map();
    for (const [fn, label] of LIST) {
      const u = (fn as { url?: string })?.url;
      if (u) map.set(new URL(u, "http://x").pathname, label);
    }
  }
  return map.get(new URL(url, "http://x").pathname) ?? null;
}

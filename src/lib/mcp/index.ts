import { auth, defineMcp } from "@lovable.dev/mcp-js";
import searchProducts from "./tools/search-products";
import listOrders from "./tools/list-orders";
import listInvoices from "./tools/list-invoices";
import searchCustomers from "./tools/search-customers";
import setInvoiceStatus from "./tools/set-invoice-status";

const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "order-buddy",
  title: "Order Buddy",
  version: "0.1.0",
  instructions:
    "Tools for the HB Chemicals OrderBot workspace. Use `search_products` for rate-list prices, `list_orders` and `list_invoices` for saved records, `search_customers` for customer details, and `set_invoice_status` to mark an invoice paid or unpaid. All data is scoped to the signed-in user's workspace.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [searchProducts, listOrders, listInvoices, searchCustomers, setInvoiceStatus],
});

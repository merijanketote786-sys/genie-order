export const DEFAULT_ORDER_TEMPLATE = `Order Number: 
Name: 
Phone: 
City: 
Address: 
Product: 
Qty:
Product Total: 
Delivery: 
Advance: 
Status: Confirmed`;

export const ORDER_TEMPLATE_MAX_LENGTH = 3000;

export const ORDER_TEMPLATE_VARIABLES = [
  { label: "Order #", token: "{{order_number}}" },
  { label: "Name", token: "{{name}}" },
  { label: "Phone", token: "{{phone}}" },
  { label: "City", token: "{{city}}" },
  { label: "Address", token: "{{address}}" },
  { label: "Product", token: "{{product}}" },
  { label: "Qty", token: "{{qty}}" },
  { label: "Product Total", token: "{{product_total}}" },
  { label: "Delivery", token: "{{delivery}}" },
  { label: "Advance", token: "{{advance}}" },
  { label: "Status", token: "{{status}}" },
] as const;

export type TemplateKind = "order" | "confirmation";

export const DEFAULT_CONFIRMATION_TEMPLATE = `*Order Confirmation*
Order #: {{order_number}}
Date: {{date}}

Name: {{name}}
Phone: {{phone}}
City: {{city}}
Address: {{address}}

{{invoice}}

Product Total: {{product_total}}
Delivery: {{delivery}}
Advance: {{advance}}
Grand Total: {{grand_total}}
{{payment}}

Thank you! Please reply to confirm your order.`;

export const CONFIRMATION_TEMPLATE_VARIABLES = [
  { label: "Order #", token: "{{order_number}}" },
  { label: "Date", token: "{{date}}" },
  { label: "Name", token: "{{name}}" },
  { label: "Phone", token: "{{phone}}" },
  { label: "City", token: "{{city}}" },
  { label: "Address", token: "{{address}}" },
  { label: "Invoice", token: "{{invoice}}" },
  { label: "Product Total", token: "{{product_total}}" },
  { label: "Delivery", token: "{{delivery}}" },
  { label: "Advance", token: "{{advance}}" },
  { label: "Grand Total", token: "{{grand_total}}" },
  { label: "Payment", token: "{{payment}}" },
  { label: "Notes", token: "{{notes}}" },
] as const;
export type AnyTemplateKind = "order" | "confirmation" | "order_input" | "invoice" | "confirmation_input";

export const DEFAULT_CONFIRMATION_INPUT_TEMPLATE = `Order Number: {{order_number}}
Name: {{name}}
Phone: {{phone}}
City: {{city}}
Address: {{address}}
Notes: {{notes}}`;

export const INPUT_TEMPLATE_VARIABLES = [
  { label: "Order #", token: "{{order_number}}" },
  { label: "Name", token: "{{name}}" },
  { label: "Phone", token: "{{phone}}" },
  { label: "City", token: "{{city}}" },
  { label: "Address", token: "{{address}}" },
  { label: "Product", token: "{{product}}" },
  { label: "Qty", token: "{{qty}}" },
  { label: "Product Total", token: "{{product_total}}" },
  { label: "Delivery", token: "{{delivery}}" },
  { label: "Advance", token: "{{advance}}" },
  { label: "Notes", token: "{{notes}}" },
  { label: "Goods adda", token: "{{goods_adda}}" },
  { label: "Courier", token: "{{courier}}" },
] as const;

const INPUT_ORDER = `Order Number: {{order_number}}
Name: {{name}}
Phone: {{phone}}
City: {{city}}
Address: {{address}}
Product: {{product}}
Qty: {{qty}}
Product Total: {{product_total}}
Delivery: {{delivery}}
Advance: {{advance}}`;

const INVOICE_DEFAULT = `*INVOICE*

{{items}}

Product Total: {{product_total}}

Delivery Charges: {{delivery}}

Grand Total: {{grand_total}}`;

export function defaultTemplateFor(kind: string): string {
  switch (kind) {
    case "confirmation": return DEFAULT_CONFIRMATION_TEMPLATE;
    case "order_input": return INPUT_ORDER;
    case "invoice": return INVOICE_DEFAULT;
    case "confirmation_input": return DEFAULT_CONFIRMATION_INPUT_TEMPLATE;
    default: return DEFAULT_ORDER_TEMPLATE;
  }
}

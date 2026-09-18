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

Shukriya! Order confirm karne ke liye reply karein.`;

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
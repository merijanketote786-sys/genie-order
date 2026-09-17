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
export const COURIER_NAMES: Record<string, string> = {
  postex: "PostEx", trax: "Trax", leopards: "Leopards", manual: "Manual (TCS, M&P, other)", confirmflow: "ConfirmFlow",
};

/** Which credential fields each courier needs; secret fields are masked after saving. */
export const COURIER_FIELDS: Record<string, { key: string; label: string; secret?: boolean; help?: string }[]> = {
  postex: [
    { key: "token", label: "API token", secret: true, help: "PostEx merchant portal → Integration → API token" },
    { key: "pickupAddressCode", label: "Pickup address code (optional)" },
  ],
  trax: [
    { key: "apiKey", label: "API key", secret: true, help: "Trax (sonic.pk) portal → API" },
    { key: "pickupAddressId", label: "Pickup address ID" },
    { key: "email", label: "Notification email (optional)" },
  ],
  leopards: [
    { key: "apiKey", label: "API key", secret: true },
    { key: "apiPassword", label: "API password", secret: true },
    { key: "originCity", label: "Origin city ID (optional, default self)" },
  ],
  manual: [],
  confirmflow: [
    { key: "outboundUrl", label: "ConfirmFlow order API URL (from their developer)" },
    { key: "apiKey", label: "ConfirmFlow API key (optional)", secret: true },
    { key: "webhookSecret", label: "Webhook secret (optional, for signature check)", secret: true },
  ],
};

export const STATUS_LABEL: Record<string, string> = {
  draft: "Draft", awaiting_confirmation: "Awaiting confirmation", confirmed: "Confirmed", cancelled: "Cancelled",
  booked: "Booked", booking_failed: "Booking failed", in_transit: "In transit", out_for_delivery: "Out for delivery",
  delivered: "Delivered", returned: "Returned", attempted: "Delivery attempted",
  sent_to_confirmflow: "Sent to ConfirmFlow", awaiting_confirmflow: "Waiting for ConfirmFlow",
};

export function confirmMessage(business: string, doc: string, name: string, cod: number, link: string) {
  return `Assalam o Alaikum ${name},\nThank you for your order ${doc} from ${business}.\nAmount to pay on delivery: Rs ${cod.toLocaleString("en-PK")}\n\nPlease confirm or cancel your order here:\n${link}`;
}

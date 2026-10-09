export const APP_SECTIONS = [
  { key: "/dashboard", label: "Dashboard" },
  { key: "/", label: "Order" },
  { key: "/invoice", label: "Invoice" },
  { key: "/pos", label: "POS" },
  { key: "/confirmation", label: "Confirmation" },
  { key: "/extract", label: "Extract" },
  { key: "/rates", label: "Rates" },
  { key: "/calculator", label: "Calculator" },
  { key: "/history", label: "History" },
  { key: "/invoices", label: "Invoices" },
  { key: "/customers", label: "Customers" },
  { key: "/labels", label: "Labels" },
  { key: "/sync", label: "Sync" },
  { key: "/accounting", label: "Accounting" },
] as const;

export type SectionKey = (typeof APP_SECTIONS)[number]["key"];

export type UserSettings = {
  theme: "system" | "light" | "dark";
  paymentEnabled: boolean;
  defaultPaymentMethod: "COD" | "CC";
  defaultDelivery: string;
  defaultCity: string;
  defaultCourierProfileId: string | null;
  defaultWeight: string;
  autoOrderNumber: boolean;
  compactMode: boolean;
  allowedSections: string[];
};

export type WorkspaceSettings = {
  businessName: string;
  businessPhone: string;
  businessAddress: string;
  currency: string;
  invoicePrefix: string;
  orderNumberStart: number;
  defaultDelivery: string;
  defaultPaymentMethod: "COD" | "CC";
  allowedSections: string[];
};

export const DEFAULT_USER_SETTINGS: UserSettings = {
  theme: "system",
  paymentEnabled: false,
  defaultPaymentMethod: "COD",
  defaultDelivery: "",
  defaultCity: "",
  defaultCourierProfileId: null,
  defaultWeight: "1",
  autoOrderNumber: true,
  compactMode: false,
  allowedSections: [],
};

export const DEFAULT_WORKSPACE_SETTINGS: WorkspaceSettings = {
  businessName: "",
  businessPhone: "",
  businessAddress: "",
  currency: "Rs",
  invoicePrefix: "INV-",
  orderNumberStart: 370,
  defaultDelivery: "",
  defaultPaymentMethod: "COD",
  allowedSections: [],
};

/** Empty list = sab sections allowed. */
export function isSectionAllowed(
  section: string,
  userAllowedRaw: string[],
  workspaceAllowed: string[],
): boolean {
  const userAllowed = stripAccessMarkers(userAllowedRaw);
  if (userAllowed.length > 0) return userAllowed.includes(section);
  if (workspaceAllowed.length > 0) return workspaceAllowed.includes(section);
  return true;
}

/** "!pos" / "!ws" markers in a user's allowed_sections block POS / Workspace for that user. */
export const NO_POS = "!pos";
export const NO_WS = "!ws";
export function stripAccessMarkers(list: string[]): string[] {
  return list.filter((k) => !k.startsWith("!"));
}
